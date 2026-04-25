import { query, type Options, type CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { isAbsolute, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { loadToken, loadProviderKey } from '../config/tokenStore.js';
import { resolveModel, apiIdFor, usesOneMillionContext } from './models.js';
import { buildSystemPrompt, buildSubagentPrompt, PARTIAL_COMPACTION } from '../prompts/index.js';
import { budgetFor, type Effort } from './effort.js';
import { FileCoordinator, lockKeyFor, type Release } from './fileLocks.js';
import { estimateTokens, contextStateFor, compactThresholdFor } from './contextBudget.js';
import { contextWindowFor } from './models.js';
import type { PermissionRule, Hook, ProviderConfig, PermissionMode } from '../config/settings.js';
import { matchRule } from './permissions.js';
import { runHooks } from './hooks.js';
import { DEFAULT_PROVIDER, providerFor, type ProviderId } from './providers.js';
import { shouldPrompt } from '../config/projectPermissions.js';
import { classifyError } from './errorClassify.js';
import type { AskRequester, AskQuestion } from './askUser.js';

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
  // When set, this string is used as the SDK systemPrompt instead of the
  // composed BASE_PROMPT + dynamic extras. Subagents use it to install a
  // persona-only system prompt so they don't carry the full main-agent
  // base prompt on every call.
  systemPromptOverride?: string;
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
  // Fires once per assistant text block, BEFORE any text_delta arrives.
  // Hooks reset their per-block streaming buffer so deltas from successive
  // blocks (e.g. text → tool → text) don't concatenate into one preview.
  onTextBlockStart?: () => void;
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
  private askRequester: AskRequester | undefined;
  private tokenTotal = 0;
  private warned = false;
  private permissionRules: PermissionRule[];
  private hooks: { preTool: Hook[]; postTool: Hook[] };
  private mcpServers: Record<string, unknown>;
  private extraAllowedTools: string[];
  private provider: string;
  private providerConfig: ProviderConfig;
  private systemPromptOverride: string | undefined;
  // Snippet prepended to the next user message after compact() runs. Lets
  // the new SDK session pick up the prior summary even though we drop the
  // session id to actually shrink the API-side history.
  private pendingRecap: string | undefined;
  // Last user message text — passed to the dynamic prompt selector so
  // keyword triggers (memory, hooks, …) only fire on relevant turns.
  private lastUserText: string | undefined;
  // Paths the agent has Read (or successfully Edited/Written) in this session.
  // Used to surface a clearer hint when an Edit/Write fires before a Read.
  private readPaths = new Set<string>();
  // Track tool name + path by tool_use id so we can update readPaths when
  // the tool_result arrives.
  private toolMeta = new Map<string, { name: string; path: string | undefined }>();
  // Pending image attachments to inject as a system note before next send.
  private pendingAttachments: Array<{ path: string; kind: 'image' | 'file' }> = [];
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
    if (opts.systemPromptOverride) this.systemPromptOverride = opts.systemPromptOverride;
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

  setMcpServers(servers: Record<string, unknown>): void {
    // SDK options are rebuilt every send(), so a plain assignment makes the
    // change take effect on the next turn — no restart needed.
    this.mcpServers = servers ?? {};
  }

  getMcpServers(): Record<string, unknown> {
    return this.mcpServers;
  }

  // Tell the client a path was read out-of-band (e.g. we did a manual fs
  // read for image paste). Lets canUseTool stop blocking subsequent Edits.
  markPathRead(filePath: string): void {
    const norm = this.normalizePath(filePath);
    if (norm) this.readPaths.add(norm);
  }

  // Queue an attachment marker that gets prepended to the next user message.
  // We don't ship the binary in-band — Read tool will load it from disk.
  attachImage(filePath: string): void {
    this.pendingAttachments.push({ path: filePath, kind: 'image' });
  }

  attachFile(filePath: string): void {
    this.pendingAttachments.push({ path: filePath, kind: 'file' });
  }

  getAttachments(): ReadonlyArray<{ path: string; kind: 'image' | 'file' }> {
    return this.pendingAttachments;
  }

  clearAttachments(): void {
    this.pendingAttachments = [];
  }

  removeAttachment(index: number): boolean {
    if (index < 0 || index >= this.pendingAttachments.length) return false;
    this.pendingAttachments.splice(index, 1);
    return true;
  }

  private normalizePath(p: unknown): string | undefined {
    if (typeof p !== 'string' || !p) return undefined;
    const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
    return process.platform === 'win32' ? abs.toLowerCase().replace(/\\/g, '/') : abs;
  }

  private extractToolPath(name: string, input: Record<string, unknown>): string | undefined {
    if (name === 'Read' || name === 'Edit' || name === 'Write' || name === 'MultiEdit') {
      return typeof input.file_path === 'string' ? (input.file_path as string) : undefined;
    }
    if (name === 'NotebookRead' || name === 'NotebookEdit') {
      return typeof input.notebook_path === 'string' ? (input.notebook_path as string) : undefined;
    }
    return undefined;
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

  setAskRequester(fn: AskRequester | undefined): void {
    this.askRequester = fn;
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
    // If the conversation is too short to split head/tail cleanly but we are
    // still over the compact threshold (e.g. a single very large user turn),
    // summarize the entire history rather than silently no-op and dispatch
    // another oversized request.
    const keepTail = this.history.length > 4 ? 4 : 0;
    const tail = keepTail > 0 ? this.history.slice(-keepTail) : [];
    const head = keepTail > 0 ? this.history.slice(0, -keepTail) : this.history;
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
    // Don't insert a synthetic "[context-recap]" history entry here — the
    // same summary is queued in pendingRecap and gets prepended to the next
    // user message in send(), so inserting it here would double-count it in
    // the local token estimate.
    this.history = [...tail];
    this.recountHistory();
    // CRITICAL: drop the SDK session so the next send() does NOT resume
    // the pre-compact session — otherwise the API still re-injects the
    // full prior history each turn and "compaction" only shrinks our
    // local UI counter, never the real billing context. The summary is
    // re-injected as the prefix of the next user message via pendingRecap.
    this.lastSessionId = undefined;
    this.pendingResume = undefined;
    this.sawRealUsage = false;
    this.pendingRecap = `[context-recap from prior session]\n${summary}`;
    // After compaction the model loses memory of previously-Read files, so
    // its next Edit/Write must be preceded by a fresh Read. Reset the gate.
    this.readPaths.clear();
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
    const hasPreHooks = this.hooks.preTool.length > 0;
    // canUseTool is always wired so the read-before-edit gate runs.
    // permissionMode is read live at invocation time (not captured in
    // closure) so a mid-turn mode switch via Shift+Tab takes effect on
    // the next tool call in the same turn.
    return async (toolName, input, opts) => {
      // AskUserQuestion intercept. The SDK has a built-in tool with a
      // strict input schema; the host (us) is expected to populate
      // updatedInput.answers via this canUseTool callback. Show the UI,
      // collect answers, return them. The SDK then formats the result
      // text for the model on its own.
      if (toolName === 'AskUserQuestion') {
        if (!this.askRequester) {
          return { behavior: 'deny', message: 'AskUserQuestion is unavailable: no UI is attached.' };
        }
        const questions = (input as { questions?: AskQuestion[] }).questions ?? [];
        const resp = await this.askRequester(questions);
        if (resp.cancelled) {
          return { behavior: 'deny', message: 'User dismissed the question.' };
        }
        return {
          behavior: 'allow',
          updatedInput: { ...(input as Record<string, unknown>), answers: resp.answers },
        };
      }

      // Yolo bypasses all remaining gates — preserves previous behavior
      // where canUseTool was not registered at all in yolo mode.
      if (this.permissionMode === 'yolo') {
        return { behavior: 'allow', updatedInput: input };
      }

      // Read-before-edit gate. SDK enforces this internally with a terse
      // error; we surface a clearer nudge so the model retries with Read.
      // We also mark the path as read on successful Edit/Write so the
      // model can chain follow-up edits to the same file without being
      // blocked again. Skipped in yolo mode (which doesn't reach here).
      const editTools = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
      if (editTools.has(toolName)) {
        const raw = this.extractToolPath(toolName, input);
        const norm = this.normalizePath(raw);
        if (raw && norm && !this.readPaths.has(norm)) {
          let exists = true;
          if (toolName === 'Write') {
            try {
              await stat(isAbsolute(raw) ? raw : resolve(process.cwd(), raw));
            } catch {
              exists = false;
            }
          }
          if (toolName !== 'Write' || exists) {
            return {
              behavior: 'deny',
              message: `must Read ${raw} before ${toolName}. Call Read on this exact path first, then re-attempt the ${toolName}.`,
            };
          }
        }
      }

      // Rule check — denies short-circuit, allows fall through to the
      // autoAccept prompt (an explicit "allow" rule means the user
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

    if (!provider.nativeAnthropic && !baseURL) {
      throw new Error(
        `provider "${this.provider}" needs an Anthropic-compat proxy URL. ` +
        `Set: forge set baseurl <url> (see: https://docs.litellm.ai/docs/providers/anthropic).`,
      );
    }

    // Build a per-call env so concurrent sends (pool, spawn_parallel) with
    // different providers don't race on shared process.env globals.
    const env: Record<string, string | undefined> = { ...process.env };
    if (this.provider === DEFAULT_PROVIDER && token.startsWith('sk-ant-oat')) {
      env.CLAUDE_CODE_OAUTH_TOKEN = token;
      delete env.ANTHROPIC_API_KEY;
    } else {
      env.ANTHROPIC_API_KEY = token;
      delete env.CLAUDE_CODE_OAUTH_TOKEN;
    }
    if (baseURL) {
      env.ANTHROPIC_BASE_URL = baseURL;
    } else {
      delete env.ANTHROPIC_BASE_URL;
    }
    // SDK MCP tools (AskUserQuestion, spawn_agent, spawn_parallel) can run
    // longer than the SDK's 60s default stream close timeout — a question
    // the user hasn't answered yet, or a subagent doing research, would
    // trip the timeout. Keep the user's explicit override if set; otherwise
    // bump to 10 minutes which comfortably covers all of these.
    if (env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT === undefined) {
      env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT = '600000';
    }

    const canUseTool = this.buildCanUseTool();
    const cwd = process.cwd();
    let systemPrompt: string;
    if (this.systemPromptOverride !== undefined) {
      // Subagents pass a persona prompt. We compose it with a slim baseline
      // (read-before-edit, verification, follow AGENTS.md) and inject the
      // project/user memory + skill index so the subagent isn't a stateless
      // box that refuses every task referencing project conventions.
      systemPrompt = await buildSubagentPrompt(this.systemPromptOverride, cwd);
    } else {
      const promptCtx: Parameters<typeof buildSystemPrompt>[1] = {
        planMode: this.permissionMode === 'plan',
        effort: this.effort,
      };
      if (this.lastUserText !== undefined) promptCtx.recentUserText = this.lastUserText;
      systemPrompt = await buildSystemPrompt(cwd, promptCtx);
    }

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

    // Extended thinking is a Claude-only API feature. Sending
    // maxThinkingTokens to non-Claude models (LiteLLM-proxied OpenAI /
    // Gemini / Nemotron, etc.) makes the proxy reject the request with
    // "unknown field". Gate on provider.nativeAnthropic AND a Claude-family
    // model id. OpenRouter's anthropic/claude-* slugs match.
    const apiId = apiIdFor(this.model);
    const isClaudeModel = /(^|\/)claude-/i.test(apiId);
    const supportsThinking = provider.nativeAnthropic && isClaudeModel;

    const options: Options = {
      model: apiId,
      cwd,
      env,
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
      includePartialMessages: true,
    };
    if (supportsThinking) {
      options.maxThinkingTokens = budgetFor(this.effort);
    }
    // 1M context window is opt-in via a beta header. Without this flag the
    // API silently caps the window at 200K even for the [1m] model variants,
    // so a user who picked "Sonnet 4.6 (1M)" would be billed/limited as
    // standard context. Only Anthropic-native paths accept the SDK `betas`
    // field; OpenRouter et al. tunnel a different shape.
    if (provider.nativeAnthropic && this.provider === DEFAULT_PROVIDER && usesOneMillionContext(this.model)) {
      (options as Options & { betas?: string[] }).betas = ['context-1m-2025-08-07'];
    }
    if (this.permissionMode === 'yolo') {
      // SDK requires this companion flag with bypassPermissions.
      (options as Options & { allowDangerouslySkipPermissions?: boolean }).allowDangerouslySkipPermissions = true;
    }
    // canUseTool is always wired so the AskUserQuestion intercept can
    // collect answers from the host UI. In yolo the inner gates short-
    // circuit to allow; in other modes locks/hooks/rules/autoAccept run.
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
    if (this.pendingAttachments.length > 0) {
      const lines: string[] = [];
      for (const att of this.pendingAttachments) {
        if (att.kind === 'image') {
          lines.push(`[attached image: ${att.path}] (use the Read tool with file_path="${att.path}" to view it)`);
        } else {
          lines.push(`[attached file: ${att.path}] (use the Read tool to inspect)`);
        }
        // Pre-mark the path as "available to read" so the model isn't blocked
        // when it Reads the attachment.
        this.markPathRead(att.path);
      }
      userText = `${lines.join('\n')}\n\n${userText}`;
      this.pendingAttachments = [];
    }
    if (this.pendingRecap !== undefined) {
      // First send() after compact(): prepend the prior-session summary so
      // the new SDK session has continuity even though we dropped the
      // session id to actually shrink the API-side history.
      userText = `${this.pendingRecap}\n\n${userText}`;
      this.pendingRecap = undefined;
    }
    this.lastUserText = userText;
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

    let out = '';
    let sawRealUsage = this.sawRealUsage;
    const thinkingBlockIndexes = new Set<number>();
    // Per-stream tool_use buffers: index -> {id, name, jsonAccum}.
    // Tool calls are emitted block-by-block in stream_event before the
    // final assistant event. We fire onToolStart on content_block_stop
    // (input JSON fully parsed) so the UI shows tools progressively
    // instead of waiting for the whole assistant turn to complete.
    const toolBlockBuffers = new Map<number, { id: string; name: string; jsonAccum: string }>();
    // Tool ids already announced via the streaming path. The assistant
    // event re-emits the same tool_use blocks at end-of-turn; skip them
    // to avoid duplicate onToolStart callbacks.
    const firedToolIds = new Set<string>();
    // Retry only safe BEFORE any event arrives. Once we start receiving
    // events the request is no longer idempotent (history mutations,
    // tool calls, fired callbacks) so failure must surface to the user.
    let receivedAny = false;
    const MAX_ATTEMPTS = 3;
    let attempt = 0;
    streamLoop: while (true) {
      attempt++;
      this.abortController = new AbortController();
      options.abortController = this.abortController;
      const stream = query({ prompt: userText, options });
    try {
      for await (const event of stream) {
        receivedAny = true;
        const sid = (event as { session_id?: string }).session_id;
        if (sid && sid !== this.lastSessionId) {
          this.lastSessionId = sid;
          cb.onSessionId?.(sid);
        }

        if (event.type === 'stream_event') {
          const raw = (event as { event: unknown }).event as {
            type?: string;
            index?: number;
            content_block?: { type?: string; id?: string; name?: string };
            delta?: { type?: string; text?: string; thinking?: string; partial_json?: string };
          };
          if (raw?.type === 'content_block_start' && typeof raw.index === 'number') {
            if (raw.content_block?.type === 'thinking') {
              thinkingBlockIndexes.add(raw.index);
            } else if (raw.content_block?.type === 'text') {
              // New text block — UI must reset its per-block streaming
              // buffer or deltas from this block concatenate with the
              // previous block's text in the live preview.
              cb.onTextBlockStart?.();
            } else if (
              raw.content_block?.type === 'tool_use' &&
              typeof raw.content_block.id === 'string' &&
              typeof raw.content_block.name === 'string'
            ) {
              toolBlockBuffers.set(raw.index, {
                id: raw.content_block.id,
                name: raw.content_block.name,
                jsonAccum: '',
              });
            }
          } else if (raw?.type === 'content_block_delta' && raw.delta) {
            if (raw.delta.type === 'thinking_delta' && raw.delta.thinking) {
              cb.onThinking?.(raw.delta.thinking);
            } else if (raw.delta.type === 'text_delta' && raw.delta.text) {
              cb.onText?.(raw.delta.text);
            } else if (
              raw.delta.type === 'input_json_delta' &&
              typeof raw.delta.partial_json === 'string' &&
              typeof raw.index === 'number'
            ) {
              const buf = toolBlockBuffers.get(raw.index);
              if (buf) buf.jsonAccum += raw.delta.partial_json;
            }
          } else if (raw?.type === 'content_block_stop' && typeof raw.index === 'number') {
            if (thinkingBlockIndexes.delete(raw.index)) {
              cb.onThinkingDone?.();
            }
            const toolBuf = toolBlockBuffers.get(raw.index);
            if (toolBuf) {
              toolBlockBuffers.delete(raw.index);
              let parsedInput: Record<string, unknown> = {};
              try {
                parsedInput = toolBuf.jsonAccum.trim()
                  ? (JSON.parse(toolBuf.jsonAccum) as Record<string, unknown>)
                  : {};
              } catch {
                // Partial / malformed JSON — leave parsedInput empty and
                // let the assistant-event branch fire with the authoritative
                // input by NOT marking this id as fired.
                continue;
              }
              if (!firedToolIds.has(toolBuf.id)) {
                firedToolIds.add(toolBuf.id);
                this.toolStartedAt.set(toolBuf.id, Date.now());
                const trackedPath = this.extractToolPath(toolBuf.name, parsedInput);
                this.toolMeta.set(toolBuf.id, { name: toolBuf.name, path: trackedPath });
                if (toolBuf.name === 'TodoWrite' && Array.isArray(parsedInput['todos'])) {
                  cb.onTodos?.(parsedInput['todos'] as AgentTodo[]);
                }
                cb.onToolStart?.({ id: toolBuf.id, name: toolBuf.name, input: parsedInput });
                if (this.hooks.postTool.length > 0) {
                  void runHooks(this.hooks.postTool, {
                    tool: toolBuf.name,
                    input: parsedInput,
                    cwd: process.cwd(),
                    phase: 'post',
                  });
                }
              }
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
              // Already fired progressively from stream_event — skip to
              // avoid a duplicate onToolStart and a duplicate row in the UI.
              if (firedToolIds.has(id)) continue;
              this.toolStartedAt.set(id, Date.now());
              const trackedPath = this.extractToolPath(block.name, toolInput);
              this.toolMeta.set(id, { name: block.name, path: trackedPath });
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
            const meta = this.toolMeta.get(b.tool_use_id);
            this.toolMeta.delete(b.tool_use_id);
            if (meta && meta.path && !b.is_error) {
              const norm = this.normalizePath(meta.path);
              if (norm) this.readPaths.add(norm);
            }
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
      // Retry transient errors only when no events have been processed
      // yet. After the first event the call is no longer idempotent.
      if (!receivedAny && attempt < MAX_ATTEMPTS) {
        const c = classifyError(err);
        if (c.retryable) {
          this.releaseAll();
          const delay = Math.min(8000, 500 * Math.pow(2, attempt - 1)) + Math.random() * 250;
          await new Promise((r) => setTimeout(r, delay));
          continue streamLoop;
        }
      }
      throw err;
    } finally {
      this.releaseAll();
    }
    break streamLoop;
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
