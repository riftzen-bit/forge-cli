import { query, type Options, type CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { loadToken } from '../config/tokenStore.js';
import { resolveModel } from './models.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { budgetFor, type Effort } from './effort.js';
import { FileCoordinator, lockKeyFor, type Release } from './fileLocks.js';
import { estimateTokens, contextState, COMPACT_THRESHOLD } from './contextBudget.js';
import type { PermissionRule, Hook } from '../config/settings.js';
import { matchRule } from './permissions.js';
import { runHooks } from './hooks.js';

type ClientOptions = {
  model: string;
  effort?: Effort;
  locks?: FileCoordinator;
  agentTag?: string;
  planMode?: boolean;
  permissionRules?: PermissionRule[];
  hooks?: { preTool: Hook[]; postTool: Hook[] };
  mcpServers?: Record<string, unknown>;
  extraAllowedTools?: string[];
};

export type ToolStartEvent = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ToolResultEvent = {
  id: string;
  ok: boolean;
  ms: number;
  preview?: string;
  lines?: number;
};

export type StreamCallbacks = {
  onThinking?: (delta: string) => void;
  onThinkingDone?: () => void;
  onText?: (delta: string) => void;
  onToolStart?: (tool: ToolStartEvent) => void;
  onToolResult?: (result: ToolResultEvent) => void;
  onSessionId?: (id: string) => void;
  onTokens?: (total: number) => void;
  onCompactWarn?: (total: number) => void;
  onCompactRun?: (before: number, after: number) => void;
};

export class AgentClient {
  private model: string;
  private effort: Effort;
  private pendingResume: string | undefined;
  private lastSessionId: string | undefined;
  private history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private locks: FileCoordinator | undefined;
  private pendingReleases = new Map<string, Release>();
  private toolStartedAt = new Map<string, number>();
  private planMode: boolean;
  private tokenTotal = 0;
  private warned = false;
  private permissionRules: PermissionRule[];
  private hooks: { preTool: Hook[]; postTool: Hook[] };
  private mcpServers: Record<string, unknown>;
  private extraAllowedTools: string[];
  readonly agentTag: string | undefined;

  constructor(opts: ClientOptions) {
    this.model = resolveModel(opts.model);
    this.effort = opts.effort ?? 'Medium';
    this.locks = opts.locks;
    this.agentTag = opts.agentTag;
    this.planMode = !!opts.planMode;
    this.permissionRules = opts.permissionRules ?? [];
    this.hooks = opts.hooks ?? { preTool: [], postTool: [] };
    this.mcpServers = opts.mcpServers ?? {};
    this.extraAllowedTools = opts.extraAllowedTools ?? [];
  }

  setPermissionRules(rules: PermissionRule[]): void {
    this.permissionRules = rules;
  }

  setHooks(hooks: { preTool: Hook[]; postTool: Hook[] }): void {
    this.hooks = hooks;
  }

  setPlanMode(on: boolean): void {
    this.planMode = on;
  }

  getPlanMode(): boolean {
    return this.planMode;
  }

  getTokenTotal(): number {
    return this.tokenTotal;
  }

  private recountHistory(): void {
    let total = 0;
    for (const h of this.history) total += estimateTokens(h.content);
    this.tokenTotal = total;
  }

  async compact(cb?: StreamCallbacks): Promise<void> {
    if (this.history.length === 0) return;
    const before = this.tokenTotal;
    const keepTail = 4;
    const tail = this.history.slice(-keepTail);
    const head = this.history.slice(0, -keepTail);
    if (head.length === 0) return;
    const transcript = head
      .map((h) => `${h.role.toUpperCase()}: ${h.content}`)
      .join('\n\n');
    const prompt =
      'Summarize the conversation below into a concise recap (<= 400 words) ' +
      'that preserves user intent, key decisions, file paths touched, and open TODOs. ' +
      'Plain prose only. No headings.\n\n' + transcript;
    const summarizer = new AgentClient({ model: this.model, effort: this.effort });
    const summary = await summarizer.send(prompt);
    this.history = [
      { role: 'user', content: `[context-recap] ${summary}` },
      ...tail,
    ];
    this.recountHistory();
    cb?.onCompactRun?.(before, this.tokenTotal);
    this.warned = false;
  }

  setModel(idOrLabel: string): void {
    this.model = resolveModel(idOrLabel);
  }

  getModel(): string {
    return this.model;
  }

  setEffort(effort: Effort): void {
    this.effort = effort;
  }

  getEffort(): Effort {
    return this.effort;
  }

  queueResume(sessionId: string): void {
    this.pendingResume = sessionId;
  }

  getLastSessionId(): string | undefined {
    return this.lastSessionId;
  }

  private buildCanUseTool(): CanUseTool | undefined {
    const locks = this.locks;
    const hasRules = this.permissionRules.length > 0;
    const hasPreHooks = this.hooks.preTool.length > 0;
    if (!locks && !hasRules && !hasPreHooks) return undefined;
    return async (toolName, input, opts) => {
      const decision = matchRule(this.permissionRules, toolName, input);
      if (decision?.decision === 'deny') {
        return { behavior: 'deny', message: `blocked by rule: ${decision.rule.tool}${decision.rule.match ? ' ~ ' + decision.rule.match : ''}` };
      }
      if (hasPreHooks) {
        await runHooks(this.hooks.preTool, { tool: toolName, input, cwd: process.cwd(), phase: 'pre' });
      }
      if (locks) {
        const req = lockKeyFor(toolName, input, process.cwd());
        if (req) {
          const release = await locks.acquire(req.key, req.mode);
          this.pendingReleases.set(opts.toolUseID, release);
        }
      }
      return { behavior: 'allow', updatedInput: input };
    };
  }

  private releaseAll(): void {
    for (const release of this.pendingReleases.values()) {
      try { release(); } catch { /* ignore */ }
    }
    this.pendingReleases.clear();
  }

  private async buildOptions(): Promise<Options> {
    const token = await loadToken();
    if (!token) throw new Error('no token configured. run: forge login');
    if (token.startsWith('sk-ant-oat')) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = token;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }

    const canUseTool = this.buildCanUseTool();
    const cwd = process.cwd();
    const systemPrompt = await buildSystemPrompt(cwd);

    const baseMode: Options['permissionMode'] = canUseTool ? 'default' : 'acceptEdits';
    const options: Options = {
      model: this.model,
      cwd,
      permissionMode: this.planMode ? 'plan' : baseMode,
      allowedTools: [
        'Read', 'Write', 'Edit',
        'Glob', 'Grep', 'Bash',
        'WebFetch', 'WebSearch',
        'NotebookRead', 'NotebookEdit',
        'TodoWrite', 'Task',
        ...this.extraAllowedTools,
      ],
      systemPrompt,
      maxThinkingTokens: budgetFor(this.effort),
      includePartialMessages: true,
    };
    if (canUseTool) options.canUseTool = canUseTool;
    if (Object.keys(this.mcpServers).length > 0) {
      options.mcpServers = this.mcpServers as unknown as Options['mcpServers'];
    }

    if (this.pendingResume) {
      options.resume = this.pendingResume;
      this.pendingResume = undefined;
    } else if (this.lastSessionId) {
      options.resume = this.lastSessionId;
    }

    return options;
  }

  async send(userText: string, cb: StreamCallbacks = {}): Promise<string> {
    this.history.push({ role: 'user', content: userText });
    this.recountHistory();

    if (this.tokenTotal >= COMPACT_THRESHOLD) {
      await this.compact(cb);
    } else {
      const state = contextState(this.tokenTotal);
      if (state === 'warn' && !this.warned) {
        this.warned = true;
        cb.onCompactWarn?.(this.tokenTotal);
      }
    }
    cb.onTokens?.(this.tokenTotal);

    const options = await this.buildOptions();

    const stream = query({ prompt: userText, options });

    let out = '';
    let sawRealUsage = false;
    try {
      for await (const event of stream) {
        const sid = (event as { session_id?: string }).session_id;
        if (sid && sid !== this.lastSessionId) {
          this.lastSessionId = sid;
          cb.onSessionId?.(sid);
        }

        if (event.type === 'stream_event') {
          const raw = (event as { event: unknown }).event as {
            type?: string;
            delta?: { type?: string; text?: string; thinking?: string };
          };
          if (raw?.type === 'content_block_delta' && raw.delta) {
            if (raw.delta.type === 'thinking_delta' && raw.delta.thinking) {
              cb.onThinking?.(raw.delta.thinking);
            } else if (raw.delta.type === 'text_delta' && raw.delta.text) {
              cb.onText?.(raw.delta.text);
            }
          } else if (raw?.type === 'content_block_stop') {
            cb.onThinkingDone?.();
          }
          continue;
        }

        if (event.type === 'assistant' && event.message?.content) {
          const usage = (event.message as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }).usage;
          if (usage) {
            const live =
              (usage.input_tokens ?? 0) +
              (usage.output_tokens ?? 0) +
              (usage.cache_read_input_tokens ?? 0) +
              (usage.cache_creation_input_tokens ?? 0);
            if (live > 0) {
              this.tokenTotal = live;
              sawRealUsage = true;
              cb.onTokens?.(live);
            }
          }
          for (const block of event.message.content) {
            if (block.type === 'text') out += block.text;
            else if (block.type === 'tool_use') {
              const toolInput = (block.input ?? {}) as Record<string, unknown>;
              const id = (block as { id?: string }).id ?? `${Date.now()}-${Math.random()}`;
              this.toolStartedAt.set(id, Date.now());
              cb.onToolStart?.({ id, name: block.name, input: toolInput });
              if (this.hooks.postTool.length > 0) {
                void runHooks(this.hooks.postTool, {
                  tool: block.name,
                  input: toolInput,
                  cwd: process.cwd(),
                  phase: 'post',
                });
              }
            }
          }
        }

        if (event.type === 'result') {
          const usage = (event as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }).usage;
          if (usage) {
            const total =
              (usage.input_tokens ?? 0) +
              (usage.output_tokens ?? 0) +
              (usage.cache_read_input_tokens ?? 0) +
              (usage.cache_creation_input_tokens ?? 0);
            if (total > 0) {
              this.tokenTotal = total;
              sawRealUsage = true;
              cb.onTokens?.(total);
            }
          }
        }

        if (event.type === 'user' && event.message?.content) {
          const content = event.message.content as unknown;
          if (Array.isArray(content)) {
            for (const block of content) {
              const b = block as {
                type?: string;
                tool_use_id?: string;
                is_error?: boolean;
                content?: unknown;
              };
              if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
                const release = this.pendingReleases.get(b.tool_use_id);
                if (release) {
                  release();
                  this.pendingReleases.delete(b.tool_use_id);
                }
                const started = this.toolStartedAt.get(b.tool_use_id);
                const ms = started ? Date.now() - started : 0;
                this.toolStartedAt.delete(b.tool_use_id);
                const { preview, lines } = extractStats(b.content);
                const evt: ToolResultEvent = {
                  id: b.tool_use_id,
                  ok: !b.is_error,
                  ms,
                };
                if (preview !== undefined) evt.preview = preview;
                if (lines !== undefined) evt.lines = lines;
                cb.onToolResult?.(evt);
              }
            }
          }
        }
      }
    } finally {
      this.releaseAll();
    }

    this.history.push({ role: 'assistant', content: out });
    if (!sawRealUsage) this.recountHistory();
    cb.onTokens?.(this.tokenTotal);
    return out.trim() || '(no output)';
  }
}

function extractStats(content: unknown): { preview?: string; lines?: number } {
  const text = pickText(content);
  if (text === undefined) return {};
  return { preview: firstLine(text), lines: countLines(text) };
}

function pickText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const c of content) {
      const b = c as { type?: string; text?: string };
      if (b?.type === 'text' && typeof b.text === 'string') return b.text;
    }
  }
  return undefined;
}

function countLines(s: string): number {
  const trimmed = s.replace(/\s+$/g, '');
  if (!trimmed) return 0;
  let n = 1;
  for (let i = 0; i < trimmed.length; i++) if (trimmed.charCodeAt(i) === 10) n++;
  return n;
}

function firstLine(s: string): string {
  const t = s.replace(/^\s+|\s+$/g, '');
  if (!t) return '';
  const nl = t.indexOf('\n');
  const line = nl >= 0 ? t.slice(0, nl) : t;
  return line.length > 100 ? line.slice(0, 99) + '...' : line;
}
