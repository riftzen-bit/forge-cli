import { query, type Options, type CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { loadToken, loadProviderKey } from '../config/tokenStore.js';
import { resolveModel } from './models.js';
import { buildSystemPrompt, PARTIAL_COMPACTION } from '../prompts/index.js';
import { budgetFor, type Effort } from './effort.js';
import { FileCoordinator, lockKeyFor, type Release } from './fileLocks.js';
import { estimateTokens, contextStateFor, compactThresholdFor } from './contextBudget.js';
import { contextWindowFor } from './models.js';
import type { PermissionRule, Hook, ProviderConfig, PermissionMode } from '../config/settings.js';
import { matchRule } from './permissions.js';
import { runHooks } from './hooks.js';
import { DEFAULT_PROVIDER, providerFor, type ProviderId } from './providers.js';
import { shouldPrompt } from '../config/projectPermissions.js';

export type PermissionDecision = 'yes' | 'yesSession' | 'no';
export type PermissionRequest = {
  tool: string;
  input: Record<string, unknown>;
};
export type PermissionRequester = (req: PermissionRequest) => Promise<PermissionDecision>;

type ClientOptions = {
  model: string;
  effort?: Effort;
  locks?: FileCoordinator;
  agentTag?: string;
  permissionMode?: PermissionMode;
  permissionRules?: PermissionRule[];
  hooks?: { preTool: Hook[]; postTool: Hook[] };
  mcpServers?: Record<string, unknown>;
  extraAllowedTools?: string[];
  provider?: ProviderId | string;
  providerConfig?: ProviderConfig;
  requester?: PermissionRequester;
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

export type UsageDelta = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export type AgentTodo = {
  content: string;
  activeForm?: string;
  status: 'pending' | 'in_progress' | 'completed';
};

export type StreamCallbacks = {
  onThinking?: (delta: string) => void;
  onThinkingDone?: () => void;
  onText?: (delta: string) => void;
  onTextBlock?: (text: string) => void;
  onToolStart?: (tool: ToolStartEvent) => void;
  onToolResult?: (result: ToolResultEvent) => void;
  onSessionId?: (id: string) => void;
  onTokens?: (total: number) => void;
  onUsage?: (delta: UsageDelta) => void;
  onCompactWarn?: (total: number) => void;
  onCompactRun?: (before: number, after: number) => void;
  onTodos?: (items: AgentTodo[]) => void;
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
  private permissionMode: PermissionMode;
  private requester: PermissionRequester | undefined;
  private tokenTotal = 0;
  private warned = false;
  private permissionRules: PermissionRule[];
  private hooks: { preTool: Hook[]; postTool: Hook[] };
  private mcpServers: Record<string, unknown>;
  private extraAllowedTools: string[];
  private provider: string;
  private providerConfig: ProviderConfig;
  readonly agentTag: string | undefined;

  constructor(opts: ClientOptions) {
    this.model = resolveModel(opts.model);
    this.effort = opts.effort ?? 'Medium';
    this.locks = opts.locks;
    this.agentTag = opts.agentTag;
    this.permissionMode = opts.permissionMode ?? 'default';
    if (opts.requester) this.requester = opts.requester;
    this.permissionRules = opts.permissionRules ?? [];
    this.hooks = opts.hooks ?? { preTool: [], postTool: [] };
    this.mcpServers = opts.mcpServers ?? {};
    this.extraAllowedTools = opts.extraAllowedTools ?? [];
    this.provider = opts.provider ?? DEFAULT_PROVIDER;
    this.providerConfig = opts.providerConfig ?? {};
  }

  setProvider(id: string, config: ProviderConfig = {}): void {
    this.provider = id;
    this.providerConfig = config;
  }

  getProvider(): string {
    return this.provider;
  }

  setPermissionRules(rules: PermissionRule[]): void {
    this.permissionRules = rules;
  }

  setHooks(hooks: { preTool: Hook[]; postTool: Hook[] }): void {
    this.hooks = hooks;
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  setPermissionRequester(fn: PermissionRequester | undefined): void {
    this.requester = fn;
  }

  // Backward-compat shims so older call sites keep working until we
  // finish migrating every caller to setPermissionMode.
  setPlanMode(on: boolean): void {
    this.permissionMode = on ? 'plan' : 'default';
  }

  getPlanMode(): boolean {
    return this.permissionMode === 'plan';
  }

  setYolo(on: boolean): void {
    this.permissionMode = on ? 'yolo' : 'default';
  }

  getYolo(): boolean {
    return this.permissionMode === 'yolo';
  }

  getTokenTotal(): number {
    return this.tokenTotal;
  }

  private sawRealUsage = false;
  private abortController: AbortController | undefined;

  cancel(): void {
    this.abortController?.abort();
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
    const prompt = `${PARTIAL_COMPACTION}\n\n--- CONVERSATION TRANSCRIPT ---\n${transcript}`;
    const summarizer = new AgentClient({
      model: this.model,
      effort: this.effort,
      provider: this.provider,
      providerConfig: this.providerConfig,
    });
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
    // Always build canUseTool when any of these is true at call time:
    // - permissionMode is autoAccept (prompt needed)
    // - rules exist (may deny)
    // - pre-hooks exist
    // - file locks configured
    // We read permissionMode live at invocation time (not capture it here)
    // so a mid-turn mode switch via Shift+Tab takes effect on the next
    // tool call in the same turn.
    const hasRules = this.permissionRules.length > 0;
    const hasPreHooks = this.hooks.preTool.length > 0;
    if (this.permissionMode !== 'autoAccept' && !locks && !hasRules && !hasPreHooks) return undefined;

    return async (toolName, input, opts) => {
      // Rule check first — denies short-circuit, allows fall through to
      // the autoAccept prompt (an explicit "allow" rule means the user
      // already opted in for this pattern, no need to re-prompt).
      const ruleDecision = matchRule(this.permissionRules, toolName, input);
      if (ruleDecision?.decision === 'deny') {
        return { behavior: 'deny', message: `blocked by rule: ${ruleDecision.rule.tool}${ruleDecision.rule.match ? ' ~ ' + ruleDecision.rule.match : ''}` };
      }
      const ruleAllowed = ruleDecision?.decision === 'allow';

      // Read mode live so mid-turn Shift+Tab cycles apply on the next call.
      const isAutoAccept = this.permissionMode === 'autoAccept';
      // autoAccept: prompt the user (unless an allow rule already covers
      // this call, or the tool is read-only). Bypass entirely if no
      // requester wired — the SDK falls back to permissionMode.
      if (isAutoAccept && !ruleAllowed && shouldPrompt(toolName) && this.requester) {
        const decision = await this.requester({ tool: toolName, input });
        if (decision === 'no') {
          return { behavior: 'deny', message: 'user declined permission for this tool call', interrupt: true };
        }
        // Both 'yes' and 'yesSession' fall through to allow. Persisting
        // the rule is the caller's responsibility (it has cwd + filesystem).
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
    const provider = providerFor(this.provider);
    const cfgBase = this.providerConfig.baseURL?.trim();
    const baseURL = cfgBase || provider.baseURL;

    let token: string | null = null;
    if (this.provider === DEFAULT_PROVIDER) {
      token = await loadToken();
    } else {
      token = await loadProviderKey(this.provider);
    }
    if (!token) {
      const hint = this.provider === DEFAULT_PROVIDER
        ? 'run: forge login'
        : `run: forge login --provider ${this.provider}`;
      throw new Error(`no key configured for provider "${this.provider}". ${hint}`);
    }

    if (this.provider === DEFAULT_PROVIDER && token.startsWith('sk-ant-oat')) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = token;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }

    if (baseURL) {
      process.env.ANTHROPIC_BASE_URL = baseURL;
    } else {
      delete process.env.ANTHROPIC_BASE_URL;
    }

    if (!provider.nativeAnthropic && !baseURL) {
      throw new Error(
        `provider "${this.provider}" needs an Anthropic-compat proxy URL. ` +
        `Set: forge set baseurl <url> (see: https://docs.litellm.ai/docs/providers/anthropic).`,
      );
    }

    const canUseTool = this.buildCanUseTool();
    const cwd = process.cwd();
    const systemPrompt = await buildSystemPrompt(cwd, { planMode: this.permissionMode === 'plan' });

    // SDK permissionMode mapping:
    //   'plan'       → SDK 'plan' (read-only enforced by SDK)
    //   'yolo'       → SDK 'bypassPermissions' + allowDangerouslySkipPermissions
    //   'autoAccept' → SDK 'default' (canUseTool drives the prompt)
    //   'default'    → SDK 'acceptEdits' (current safe baseline)
    const sdkMode: Options['permissionMode'] =
      this.permissionMode === 'plan'
        ? 'plan'
        : this.permissionMode === 'yolo'
          ? 'bypassPermissions'
          : this.permissionMode === 'autoAccept'
            ? 'default'
            : 'acceptEdits';

    const options: Options = {
      model: this.model,
      cwd,
      permissionMode: sdkMode,
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
    if (this.permissionMode === 'yolo') {
      // SDK requires this companion flag with bypassPermissions.
      (options as Options & { allowDangerouslySkipPermissions?: boolean }).allowDangerouslySkipPermissions = true;
    }
    // canUseTool is dropped in yolo (SDK bypasses it anyway) but kept in
    // every other mode so locks/hooks/rules/autoAccept-prompt still run.
    if (canUseTool && this.permissionMode !== 'yolo') options.canUseTool = canUseTool;
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
    // If we have real usage from a prior turn, don't overwrite it with a
    // local history estimate — local history excludes tool content so the
    // estimate is far below true context size. Just add the new user text.
    if (this.sawRealUsage) {
      this.tokenTotal += estimateTokens(userText);
    } else {
      this.recountHistory();
    }

    const limit = contextWindowFor(this.model);
    if (this.tokenTotal >= compactThresholdFor(limit)) {
      await this.compact(cb);
    } else {
      const state = contextStateFor(this.tokenTotal, limit);
      if (state === 'warn' && !this.warned) {
        this.warned = true;
        cb.onCompactWarn?.(this.tokenTotal);
      }
    }
    cb.onTokens?.(this.tokenTotal);

    const options = await this.buildOptions();
    this.abortController = new AbortController();
    options.abortController = this.abortController;

    const stream = query({ prompt: userText, options });

    let out = '';
    let sawRealUsage = this.sawRealUsage;
    const thinkingBlockIndexes = new Set<number>();
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
            index?: number;
            content_block?: { type?: string };
            delta?: { type?: string; text?: string; thinking?: string };
          };
          if (raw?.type === 'content_block_start' && typeof raw.index === 'number') {
            if (raw.content_block?.type === 'thinking') {
              thinkingBlockIndexes.add(raw.index);
            }
          } else if (raw?.type === 'content_block_delta' && raw.delta) {
            if (raw.delta.type === 'thinking_delta' && raw.delta.thinking) {
              cb.onThinking?.(raw.delta.thinking);
            } else if (raw.delta.type === 'text_delta' && raw.delta.text) {
              cb.onText?.(raw.delta.text);
            }
          } else if (raw?.type === 'content_block_stop' && typeof raw.index === 'number') {
            if (thinkingBlockIndexes.delete(raw.index)) {
              cb.onThinkingDone?.();
            }
          }
          continue;
        }

        if (event.type === 'assistant' && event.message?.content) {
          const usage = (event.message as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }).usage;
          if (usage) {
            // Context window usage for THIS request only. Excludes output
            // (generated, not yet in context) and never sums across requests
            // in a turn — each assistant event reports its own request.
            const ctx =
              (usage.input_tokens ?? 0) +
              (usage.cache_read_input_tokens ?? 0) +
              (usage.cache_creation_input_tokens ?? 0);
            if (ctx > 0) {
              this.tokenTotal = ctx;
              sawRealUsage = true;
              cb.onTokens?.(ctx);
            }
          }
          for (const block of event.message.content) {
            if (block.type === 'text') {
              out += block.text;
              cb.onTextBlock?.(block.text);
            }
            else if (block.type === 'tool_use') {
              const toolInput = (block.input ?? {}) as Record<string, unknown>;
              const id = (block as { id?: string }).id ?? `${Date.now()}-${Math.random()}`;
              this.toolStartedAt.set(id, Date.now());
              if (block.name === 'TodoWrite' && Array.isArray(toolInput['todos'])) {
                const items = toolInput['todos'] as AgentTodo[];
                cb.onTodos?.(items);
              }
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
          // result event carries cumulative usage for billing — pass delta
          // through for cost tracking but DO NOT overwrite tokenTotal, which
          // tracks current context window size (assistant event is source).
          const usage = (event as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }).usage;
          if (usage) {
            cb.onUsage?.({
              input: usage.input_tokens ?? 0,
              output: usage.output_tokens ?? 0,
              cacheRead: usage.cache_read_input_tokens ?? 0,
              cacheWrite: usage.cache_creation_input_tokens ?? 0,
            });
          }
        }

        if (event.type === 'user' && event.message?.content) {
          const blocks = toToolResultBlocks(event.message.content);
          for (const b of blocks) {
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
    } catch (err) {
      if (this.abortController?.signal.aborted) {
        // Treat abort as clean cancel, not error. Record whatever text came
        // through so subsequent turns see the truncated assistant turn.
        this.history.push({ role: 'assistant', content: out || '(cancelled)' });
        this.sawRealUsage = sawRealUsage;
        if (!sawRealUsage) this.recountHistory();
        this.abortController = undefined;
        this.releaseAll();
        return '(cancelled)';
      }
      throw err;
    } finally {
      this.releaseAll();
    }
    this.abortController = undefined;

    this.history.push({ role: 'assistant', content: out });
    this.sawRealUsage = sawRealUsage;
    if (!sawRealUsage) this.recountHistory();
    cb.onTokens?.(this.tokenTotal);
    return out.trim() || '(no output)';
  }
}

type ToolResultBlock = {
  tool_use_id: string;
  is_error: boolean;
  content: unknown;
};

// Normalise the many shapes the SDK can emit for a user-role message body
// carrying tool_result blocks. The happy path is an array of blocks; some
// error/resume paths deliver a bare string or a single object, in which
// case we can't recover a tool_use_id and must skip.
function toToolResultBlocks(content: unknown): ToolResultBlock[] {
  const out: ToolResultBlock[] = [];
  const push = (raw: unknown): void => {
    const b = raw as {
      type?: string;
      tool_use_id?: string;
      is_error?: boolean;
      content?: unknown;
    };
    if (b?.type === 'tool_result' && typeof b.tool_use_id === 'string') {
      out.push({
        tool_use_id: b.tool_use_id,
        is_error: !!b.is_error,
        content: b.content,
      });
    }
  };
  if (Array.isArray(content)) {
    for (const b of content) push(b);
  } else if (content && typeof content === 'object') {
    push(content);
  }
  return out;
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
