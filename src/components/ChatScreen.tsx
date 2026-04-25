// Main chat UI. Most business logic has been extracted to hooks under
// `./chat/`; this file is responsible for:
//   - owning top-level UI state (input, history, pickers, busy)
//   - wiring the extracted hooks together via a CommandCtx
//   - rendering the Ink layout
//
// Keep this file thin. If a block of logic needs more than a few lines,
// move it into the corresponding hook under ./chat/.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Static, Text, useApp, useInput } from 'ink';

import { SimpleTextInput } from './SimpleTextInput.js';
import { Banner } from './Banner.js';
import { Tips } from './Tips.js';
import { MessageRow } from './MessageRow.js';
import { ThinkingLine } from './ThinkingLine.js';
import { CommandPalette } from './CommandPalette.js';
import { ModelSelector } from './ModelSelector.js';
import { EffortSelector } from './EffortSelector.js';
import { ResumeSelector } from './ResumeSelector.js';
import { ProviderSelector } from './ProviderSelector.js';
import { StatusBar } from './StatusBar.js';
import { TodoList } from './TodoList.js';
import { PermissionPrompt, type PermissionChoice } from './PermissionPrompt.js';
import { AskQuestionPrompt } from './AskQuestionPrompt.js';
import type { ChatMessage } from './MessageList.js';

import { ActiveToolsPanel } from './chat/ActiveToolsPanel.js';
import { SubagentPanel } from './chat/SubagentPanel.js';
import { StreamingPreview } from './chat/StreamingPreview.js';
import { AttachmentsPanel } from './chat/AttachmentsPanel.js';
import { useStreamState } from './chat/useStreamState.js';
import { useActiveTools } from './chat/useActiveTools.js';
import { useSessionStats } from './chat/useSessionStats.js';
import { useChatClient } from './chat/useChatClient.js';
import { useChatCommands } from './chat/useChatCommands.js';
import { makeSubmit } from './chat/useChatSubmit.js';
import type { PickerMode, StaticItem } from './chat/types.js';
import type { CommandCtx } from './chat/commands/ctx.js';

import { TodoStore, type Todo } from '../agent/todos.js';
import { filterCommands, expand } from '../commands/registry.js';
import { resolveModel } from '../agent/models.js';
import { DEFAULT_EFFORT, type Effort } from '../agent/effort.js';
import type { AuthStatus } from '../auth/status.js';
import type { Settings, PermissionMode } from '../config/settings.js';
import { DEFAULT_PERMISSION_MODE, nextPermissionMode, saveSettings } from '../config/settings.js';
import {
  appendProjectAllow,
  loadProjectPermissions,
  matchPatternFor,
  projectRulesAsPermissionRules,
} from '../config/projectPermissions.js';
import { getTheme } from '../ui/theme.js';
import { DEFAULT_PROVIDER } from '../agent/providers.js';
import { listProviderKeys } from '../config/tokenStore.js';
import { InputHistory } from '../agent/inputHistory.js';
import type { PermissionRequest } from '../agent/client.js';
import type { AskAnswer, AskQuestion } from '../agent/askUser.js';
import { captureClipboardImage } from '../agent/clipboard.js';
import { LoginPicker } from './LoginPicker.js';
import { G } from '../ui/glyphs.js';

type Props = {
  model: string;
  effort?: Effort;
  auth: AuthStatus;
  cwd: string;
  oneShot?: string;
  settings?: Settings;
  onExit: () => void;
  onRequestOAuth?: () => void;
};

export function ChatScreen({ model, effort, auth, cwd, oneShot, settings, onExit, onRequestOAuth }: Props) {
  const { exit } = useApp();
  const t = getTheme();
  // --- UI state ---
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyStartedAt, setBusyStartedAt] = useState<number | undefined>();
  const [cursor, setCursor] = useState(0);
  const [activeModel, setActiveModel] = useState(resolveModel(model));
  const [activeEffort, setActiveEffort] = useState<Effort>(effort ?? DEFAULT_EFFORT);
  const [picker, setPicker] = useState<PickerMode>('none');
  const [verbose, setVerbose] = useState(false);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [permissionMode, setPermissionModeState] = useState<PermissionMode>(
    settings?.permissionMode ?? DEFAULT_PERMISSION_MODE,
  );
  const [pendingPermission, setPendingPermission] = useState<
    | (PermissionRequest & { resolve: (c: PermissionChoice) => void })
    | undefined
  >(undefined);
  // Queue of permission requests that arrived while another was pending.
  // The prompt shows the head; when the user picks, we pop the next one.
  // Without a queue, a second request would overwrite the first and
  // deadlock the SDK's canUseTool await for the dropped request.
  const permissionQueueRef = useRef<
    Array<PermissionRequest & { resolve: (c: PermissionChoice) => void }>
  >([]);
  // AskUserQuestion modal: same queueing pattern as permissions so two
  // back-to-back tool calls don't drop the second prompt and deadlock the
  // SDK's awaiting promise.
  type PendingAsk = { questions: AskQuestion[]; resolve: (a: AskAnswer) => void; _id: number };
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | undefined>(undefined);
  const askQueueRef = useRef<PendingAsk[]>([]);
  const askIdRef = useRef(0);
  const [renderEpoch, setRenderEpoch] = useState(0);
  const [queue, setQueue] = useState<string[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>(
    settings?.activeProvider ?? DEFAULT_PROVIDER,
  );
  const [providerKeys, setProviderKeys] = useState<Set<string>>(new Set());
  const [loginInitialProvider, setLoginInitialProvider] = useState<string | undefined>(undefined);
  const [attachmentTick, setAttachmentTick] = useState(0);

  // --- Refs ---
  const busyRef = useRef(false);
  const prevBusyRef = useRef(false);
  const lastUserMsgRef = useRef<string>('');
  const inputHistoryRef = useRef<InputHistory>(new InputHistory(settings?.inputHistory?.max ?? 500));
  const queueRef = useRef<string[]>([]);
  const submitRef = useRef<(text: string) => Promise<void>>(async () => {});

  // --- Helpers ---
  const appendHistory = (m: ChatMessage) => setHistory((h) => [...h, m]);
  async function refreshProviderKeys(): Promise<void> {
    try {
      const list = await listProviderKeys();
      setProviderKeys(new Set(list));
    } catch {
      /* ignore */
    }
  }

  // --- Hooks ---
  const stats = useSessionStats(activeModel);
  const stream = useStreamState(busy, appendHistory);
  const tools = useActiveTools({
    cwd,
    flushThinking: stream.flushThinking,
    appendHistory,
    sessionStatsRef: stats.sessionStatsRef,
  });
  const [todoStore] = useState(() => new TodoStore());
  const chatClient = useChatClient({
    model,
    effort,
    settings,
    handleThinking: stream.handleThinking,
    pushSubDelta: stream.pushSubDelta,
    removeSubPreview: stream.removeSubPreview,
    subStatsRef: tools.subStatsRef,
  });

  // --- Busy lifecycle ---
  // beginBusy/endBusy are kept here because they drive UI-scoped busy state
  // plus coordinate resets across useStreamState and useActiveTools.
  const beginBusy = () => {
    busyRef.current = true;
    setBusy(true);
    setBusyStartedAt(Date.now());
    stream.resetThinking();
  };
  const endBusy = () => {
    busyRef.current = false;
    setBusy(false);
    setBusyStartedAt(undefined);
    stream.resetThinking();
    tools.clearAll();
  };

  // --- Command ctx + handlers ---
  const cmdCtx: CommandCtx = {
    cwd,
    settings,
    auth,
    onExit,
    exit,
    client: chatClient.client,
    pool: chatClient.pool,
    coordinator: chatClient.coordinator,
    todoStore,
    getActiveModel: () => activeModel,
    getActiveEffort: () => activeEffort,
    getActiveProvider: () => activeProvider,
    getPermissionMode: () => permissionMode,
    getTokens: () => stats.tokens,
    setActiveModel,
    setActiveEffort,
    setActiveProvider,
    setPermissionMode: setPermissionModeState,
    setTokens: stats.setTokens,
    setPicker,
    setRenderEpoch,
    setHistory,
    appendHistory,
    handleThinking: stream.handleThinking,
    flushThinking: stream.flushThinking,
    pushSubDelta: stream.pushSubDelta,
    removeSubPreview: stream.removeSubPreview,
    handleToolStart: tools.handleToolStart,
    handleToolResult: tools.handleToolResult,
    subStatsRef: tools.subStatsRef,
    sessionStatsRef: stats.sessionStatsRef,
    beginBusy,
    endBusy,
    handleTokens: stats.handleTokens,
    providerKeys,
    refreshProviderKeys,
    bumpAttachmentTick: () => setAttachmentTick((n) => n + 1),
    lastUserMsgRef,
    inputHistoryRef,
    submitRef,
  };
  const commands = useChatCommands(cmdCtx);

  // Refresh spawn-server handler indirection each render so the frozen
  // client sees the latest state-bound callbacks.
  chatClient.spawnHandlersRef.current = {
    onToolStart: tools.handleToolStart,
    onToolResult: tools.handleToolResult,
    appendHistory,
    getModel: () => activeModel,
    getEffort: () => activeEffort,
    getProvider: () => activeProvider,
    getProviderConfig: () => settings?.providers?.[activeProvider] ?? {},
  };

  // --- Submit ---
  const submit = makeSubmit({
    cwd,
    client: chatClient.client,
    settings,
    setInput,
    setCursor,
    setHistory,
    setPicker,
    setLoginInitialProvider,
    setQueue,
    bumpAttachmentTick: () => setAttachmentTick((n) => n + 1),
    busyRef,
    queueRef,
    lastUserMsgRef,
    inputHistoryRef,
    sessionStatsRef: stats.sessionStatsRef,
    beginBusy,
    endBusy,
    handleThinking: stream.handleThinking,
    handleText: stream.handleText,
    flushThinking: stream.flushThinking,
    flushStreaming: stream.flushStreaming,
    resetStreaming: stream.resetStreaming,
    handleToolStart: tools.handleToolStart,
    handleToolResult: tools.handleToolResult,
    handleTokens: stats.handleTokens,
    handleUsage: stats.handleUsage,
    todoStore,
    commands,
    onExit,
    exit,
  });
  submitRef.current = submit;

  // --- Effects ---
  useEffect(() => todoStore.subscribe(setTodos), [todoStore]);

  useEffect(() => {
    if (settings?.inputHistory?.enabled !== false) {
      void inputHistoryRef.current.load();
    }
  }, [settings?.inputHistory?.enabled]);

  useEffect(() => {
    void refreshProviderKeys();
  }, []);

  useEffect(() => {
    // Force Static to re-emit its scrollback buffer after a terminal resize.
    const onResize = () => {
      setRenderEpoch((n) => n + 1);
    };
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  // Drain the input queue when we flip from busy -> idle.
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = busy;
    if (wasBusy && !busy && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      setQueue([...queueRef.current]);
      void submitRef.current(next);
    }
  }, [busy]);

  // Auto-clear Todo panel when idle and every item is done. Short delay
  // so the user sees the completed state flash before it disappears.
  useEffect(() => {
    if (busy) return;
    if (todos.length === 0) return;
    if (!todos.every((td) => td.status === 'done')) return;
    const timer = setTimeout(() => todoStore.clear(), 1500);
    return () => clearTimeout(timer);
  }, [busy, todos, todoStore]);

  // One-shot mode: auto-submit the supplied text, then exit.
  useEffect(() => {
    if (oneShot) {
      void (async () => {
        // Use submitRef so we invoke the latest closure (which captures
        // current commands/chatClient/settings). Calling the first-render
        // `submit` here would bake in stale refs to long-lived objects.
        await submitRef.current(oneShot);
        onExit();
        exit();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const palette = useMemo(() => filterCommands(input), [input]);
  const paletteOpen = palette.length > 0 && input.startsWith('/') && picker === 'none';

  useEffect(() => {
    if (cursor >= palette.length) setCursor(0);
  }, [palette.length, cursor]);

  // Stable async paste helper used by both useInput and the raw-stdin
  // listener so the two paths can't diverge. The lockout prevents a
  // double-attach when a terminal forwards Ctrl+V to Ink's useInput AND
  // the raw stdin sees the 0x16 byte for the same keystroke.
  const lastPasteAtRef = useRef(0);
  async function tryPasteImage(silent = false): Promise<void> {
    const now = Date.now();
    if (now - lastPasteAtRef.current < 250) return;
    lastPasteAtRef.current = now;
    const r = await captureClipboardImage();
    if (r.ok) {
      chatClient.client.attachImage(r.path);
      setAttachmentTick((n) => n + 1);
      appendHistory({ role: 'system', text: `attached image: ${r.path} (ctrl+x to clear)` });
    } else if (!silent) {
      appendHistory({ role: 'system', text: `paste image failed: ${r.reason}` });
    }
  }
  function clearPendingAttachments(): void {
    const n = chatClient.client.getAttachments().length;
    if (n === 0) return;
    chatClient.client.clearAttachments();
    setAttachmentTick((t) => t + 1);
    appendHistory({ role: 'system', text: `cleared ${n} attachment${n === 1 ? '' : 's'}` });
  }

  // Raw-stdin listener: catches Ctrl+V (byte 0x16) BEFORE Ink's parser, so
  // it works on terminals where Ink's useInput swallows or never receives
  // the chord. Bracketed-paste markers are also probed: when a terminal
  // sends \x1b[200~...\x1b[201~ for any paste, we peek the clipboard for
  // an image (text-only paste yields a "no image" toast which is harmless).
  useEffect(() => {
    if (!process.stdin.isTTY) return;
    let inPaste = false;
    let pasteTimer: NodeJS.Timeout | undefined;
    const onData = (chunk: Buffer | string): void => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      // Lone Ctrl+V byte (raw, before Ink's parser).
      if (buf.length === 1 && buf[0] === 0x16) {
        void tryPasteImage(false);
        return;
      }
      const text = buf.toString('binary');
      if (text.includes('\x1b[200~')) inPaste = true;
      if (inPaste && text.includes('\x1b[201~')) {
        inPaste = false;
        if (pasteTimer) clearTimeout(pasteTimer);
        pasteTimer = setTimeout(() => {
          // silent: text-only paste returns "no image", which is expected
          void tryPasteImage(true);
        }, 30);
      }
    };
    process.stdin.on('data', onData);
    return () => {
      process.stdin.off('data', onData);
      if (pasteTimer) clearTimeout(pasteTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput((ch, key) => {
    // Permission prompt is modal — its own useInput handles arrows/enter.
    if (pendingPermission) return;
    // AskUserQuestion modal owns its own keys too.
    if (pendingAsk) return;
    if (picker !== 'none') return;
    // Shift+Tab cycles permission mode regardless of busy state, so users
    // can flip into Plan or YOLO mid-turn (next tool call picks it up).
    if (key.shift && key.tab) {
      const msg = commands.cyclePermissionMode();
      appendHistory({ role: 'system', text: msg });
      return;
    }
    // Ctrl+V: many terminals (Windows Terminal, iTerm2 with default config)
    // intercept Ctrl+V at the application layer for "paste" and never forward
    // it to stdin — so this useInput branch only fires on terminals that DO
    // forward it. The raw-stdin listener below catches the 0x16 byte directly
    // for terminals that send the chord. Ctrl+P is also wired as a guaranteed
    // fallback chord no terminal binds.
    if ((key.ctrl && ch === 'v') || (key.ctrl && ch === 'p')) {
      void tryPasteImage();
      return;
    }
    // Ctrl+X drops pending image attachments before they get sent.
    if (key.ctrl && ch === 'x') {
      clearPendingAttachments();
      return;
    }
    if (key.ctrl && ch === 'o') {
      // Toggle verbose AND repaint terminal: Ink's <Static> writes each item
      // to scrollback exactly once, so previously-emitted MessageRows freeze
      // at their old size when verbose flips. Without a repaint, expanded
      // rows stay tall (or collapsed rows stay short), leaving dead vertical
      // space between the static area and the dynamic input. Clear the
      // terminal + scrollback, bump renderEpoch to remount Static, and the
      // whole transcript redraws at the new verbosity.
      setVerbose((v) => !v);
      process.stdout.write('\x1Bc\x1B[3J');
      setRenderEpoch((n) => n + 1);
      return;
    }
    // Esc while busy = cancel running agent turn. Takes precedence over
    // palette / input handling so users can always bail out.
    if (key.escape && busy) {
      chatClient.client.cancel();
      appendHistory({ role: 'system', text: 'cancelled (esc)' });
      return;
    }
    // Esc while idle with a non-empty queue = drop the queue.
    if (key.escape && !busy && queueRef.current.length > 0) {
      queueRef.current = [];
      setQueue([]);
      appendHistory({ role: 'system', text: 'queue cleared' });
      return;
    }
    // Enter on empty input while idle + queue has items = drain the
    // oldest queued item immediately. Lets user "push up" a queued msg.
    if (key.return && !busy && input.trim() === '' && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      setQueue([...queueRef.current]);
      void submitRef.current(next);
      return;
    }
    // Enter on empty input WHILE busy + queue has items = cancel current
    // turn and let the busy->idle drain effect immediately submit the next
    // queued message. Matches the user mental model of "push queued up now".
    if (key.return && busy && input.trim() === '' && queueRef.current.length > 0) {
      chatClient.client.cancel();
      appendHistory({ role: 'system', text: 'skipped current turn -- running queued' });
      return;
    }
    if (!paletteOpen) return;
    if (key.upArrow) {
      setCursor((c) => (c - 1 + palette.length) % palette.length);
      return;
    }
    if (key.downArrow) {
      setCursor((c) => (c + 1) % palette.length);
      return;
    }
    if (key.tab) {
      const sel = palette[cursor];
      if (sel) setInput(expand(sel));
      return;
    }
    if (key.escape) {
      setInput('');
      setCursor(0);
    }
  });

  // Track pendingPermission in a ref so unmount can resolve any in-flight
  // request with 'no' — leaving it unresolved would deadlock the SDK's
  // canUseTool await forever.
  const pendingPermissionRef = useRef(pendingPermission);
  useEffect(() => {
    pendingPermissionRef.current = pendingPermission;
  }, [pendingPermission]);

  // Same trick for the AskUserQuestion prompt — unmount must resolve any
  // in-flight ask Promise with cancelled:true so the in-process MCP tool
  // doesn't hang the SDK forever waiting for a UI that no longer exists.
  const pendingAskRef = useRef(pendingAsk);
  useEffect(() => {
    pendingAskRef.current = pendingAsk;
  }, [pendingAsk]);

  useEffect(() => {
    chatClient.setAskRequester((questions) => {
      return new Promise<AskAnswer>((resolve) => {
        askIdRef.current += 1;
        const entry: PendingAsk = { questions, resolve, _id: askIdRef.current };
        setPendingAsk((cur) => {
          if (cur) {
            askQueueRef.current.push(entry);
            return cur;
          }
          return entry;
        });
      });
    });
    return () => {
      chatClient.setAskRequester(undefined);
      const p = pendingAskRef.current;
      if (p) p.resolve({ answers: {}, cancelled: true });
      for (const q of askQueueRef.current) q.resolve({ answers: {}, cancelled: true });
      askQueueRef.current = [];
    };
    // setAskRequester is held in useState() inside useChatClient and is
    // stable for the life of the chat session, so re-wiring on every
    // render would only re-resolve in-flight asks as cancelled. Depend on
    // the client (also stable) so the effect runs once at mount/unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatClient.client]);

  // Wire the permission requester once so the client sees state updates
  // through the setter closure. On unmount, clear the requester AND
  // resolve any pending/queued Promises so the SDK doesn't hang.
  useEffect(() => {
    chatClient.client.setPermissionRequester((req) => {
      return new Promise<PermissionChoice>((resolve) => {
        const entry = { ...req, resolve };
        setPendingPermission((cur) => {
          if (cur) {
            permissionQueueRef.current.push(entry);
            return cur;
          }
          return entry;
        });
      });
    });
    return () => {
      chatClient.client.setPermissionRequester(undefined);
      const p = pendingPermissionRef.current;
      if (p) p.resolve('no');
      for (const q of permissionQueueRef.current) q.resolve('no');
      permissionQueueRef.current = [];
    };
  }, [chatClient.client]);

  // Load project-local permission rules and merge with global rules. Re-runs
  // when the user accepts "Yes Allow Session" so the new rule takes effect
  // immediately for the next tool call.
  async function refreshProjectPermissions(): Promise<void> {
    try {
      const proj = await loadProjectPermissions(cwd);
      const projRules = projectRulesAsPermissionRules(proj);
      const merged = [...(settings?.permissionRules ?? []), ...projRules];
      chatClient.client.setPermissionRules(merged);
    } catch {
      /* best-effort */
    }
  }
  useEffect(() => {
    void refreshProjectPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the client's permissionMode in sync with React state so the
  // SDK options flush each turn. setPermissionMode on the client is
  // a plain setter so this is cheap.
  useEffect(() => {
    chatClient.client.setPermissionMode(permissionMode);
  }, [chatClient.client, permissionMode]);

  // --- Render ---
  const modeBorderColor =
    permissionMode === 'plan'
      ? t.modePlan
      : permissionMode === 'yolo'
        ? t.modeYolo
        : permissionMode === 'autoAccept'
          ? t.modeAutoAccept
          : t.accent;
  const promptColor = busy ? t.muted : modeBorderColor;
  const staticItems: StaticItem[] = [
    { kind: 'banner', id: 'banner' },
    { kind: 'tips', id: 'tips' },
    ...history.map((m, i): StaticItem => ({ kind: 'msg', id: `m${i}`, message: m })),
  ];

  return (
    <Box flexDirection="column">
      <Static key={`static-${renderEpoch}`} items={staticItems}>
        {(item) => {
          if (item.kind === 'banner') return <Banner key={item.id} cwd={cwd} />;
          if (item.kind === 'tips') return <Tips key={item.id} />;
          return <MessageRow key={item.id} message={item.message} verbose={verbose} />;
        }}
      </Static>

      {picker === 'model' && (
        <ModelSelector
          current={activeModel}
          providerKeys={providerKeys}
          activeProvider={activeProvider}
          onSelect={(id) => void commands.applyModel(id)}
          onCancel={() => setPicker('none')}
        />
      )}
      {picker === 'effort' && (
        <EffortSelector
          current={activeEffort}
          onSelect={(e) => void commands.applyEffort(e)}
          onCancel={() => setPicker('none')}
        />
      )}
      {picker === 'resume' && (
        <ResumeSelector
          onSelect={(s) => void commands.applyResume(s)}
          onCancel={() => setPicker('none')}
        />
      )}
      {picker === 'provider' && (
        <ProviderSelector
          current={activeProvider}
          hasKey={(id) => providerKeys.has(id)}
          onSelect={(id) => void commands.applyProvider(id)}
          onCancel={() => setPicker('none')}
        />
      )}
      {picker === 'login' && (
        <LoginPicker
          initialProvider={loginInitialProvider}
          onDone={async (msg) => {
            setPicker('none');
            setLoginInitialProvider(undefined);
            await refreshProviderKeys();
            appendHistory({ role: 'system', text: msg });
          }}
          onCancel={() => {
            setPicker('none');
            setLoginInitialProvider(undefined);
          }}
          onRequestOAuth={onRequestOAuth}
        />
      )}

      {pendingAsk && !pendingPermission && (() => {
        const askProps: React.ComponentProps<typeof AskQuestionPrompt> = {
          questions: pendingAsk.questions,
          onAnswer: (answer) => {
            const req = pendingAsk;
            const next = askQueueRef.current.shift();
            setPendingAsk(next);
            req.resolve(answer);
          },
        };
        // Key on the per-request id so the modal remounts (and its idx /
        // picked / phase state resets) when the user finishes one ask and
        // a queued one slides in.
        return <AskQuestionPrompt key={`ask-${pendingAsk._id}`} {...askProps} />;
      })()}

      {pendingPermission && (
        <PermissionPrompt
          tool={pendingPermission.tool}
          input={pendingPermission.input}
          onPick={async (choice) => {
            const req = pendingPermission;
            // Show the next queued request (if any) immediately.
            const next = permissionQueueRef.current.shift();
            setPendingPermission(next);
            if (choice === 'yesSession') {
              const match = matchPatternFor(req.tool, req.input);
              const rule: Parameters<typeof appendProjectAllow>[1] = {
                tool: req.tool,
                decision: 'allow',
              };
              if (match !== undefined) rule.match = match;
              try {
                await appendProjectAllow(cwd, rule);
                await refreshProjectPermissions();
                appendHistory({
                  role: 'system',
                  text: `saved session rule: ${req.tool}${match ? ' ~ ' + match : ' (any input)'}`,
                });
              } catch (err) {
                appendHistory({
                  role: 'error',
                  text: `failed to save permission: ${(err as Error).message}`,
                });
              }
            }
            req.resolve(choice);
          }}
        />
      )}

      {!pendingPermission && !pendingAsk && picker === 'none' && (
        <Box flexDirection="column">
          <TodoList todos={todos} />
          {tools.activeTools.length > 0 && (
            <ActiveToolsPanel tools={tools.activeTools} cwd={cwd} verbose={verbose} />
          )}
          {busy && stream.subPreviews.length > 0 && (
            <SubagentPanel subs={stream.subPreviews} verbose={verbose} />
          )}
          {busy && (
            <ThinkingLine text={stream.thinking} verbose={verbose} startedAt={busyStartedAt} />
          )}
          {busy && stream.streamingText && (
            <StreamingPreview text={stream.streamingText} verbose={verbose} />
          )}
          <AttachmentsPanel client={chatClient.client} tick={attachmentTick} />
          {queue.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Box>
                <Text color={t.info} bold>{'» '}</Text>
                <Text color={t.info} bold>queued ({queue.length})</Text>
                <Text color={t.muted}>  sends when agent idles</Text>
              </Box>
              <Box
                flexDirection="column"
                borderStyle="single"
                borderLeft
                borderTop={false}
                borderRight={false}
                borderBottom={false}
                borderColor={t.info}
                paddingLeft={1}
              >
                {queue.map((q, i) => (
                  <Box key={i}>
                    <Text color={t.info}>{i + 1}. </Text>
                    <Text color={t.text} wrap="truncate-end">{q}</Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
          <Box borderStyle="round" borderColor={promptColor} paddingX={1}>
            <Text color={promptColor} bold>{busy ? G.ellipsis : G.prompt} </Text>
            <SimpleTextInput
              value={input}
              onChange={setInput}
              onSubmit={submit}
              onHistoryUp={() => {
                if (paletteOpen) return null;
                return inputHistoryRef.current.up();
              }}
              onHistoryDown={() => {
                if (paletteOpen) return null;
                return inputHistoryRef.current.down();
              }}
              placeholder={busy ? 'queue a follow-up — sends when ready' : 'what should forge build, fix, or explain?'}
            />
          </Box>
          {paletteOpen && <CommandPalette commands={palette} cursor={cursor} />}
          <Box paddingX={1} flexDirection="column">
            <StatusBar
              model={activeModel}
              effort={activeEffort}
              auth={auth}
              cwd={cwd}
              provider={activeProvider}
              permissionMode={permissionMode}
              tokens={stats.tokens}
              template={settings?.statusLine}
            />
            <Box flexWrap="wrap">
              <Text color={t.accentDim} bold>enter</Text>
              <Text color={t.muted}> send {G.bullet} </Text>
              <Text color={t.accentDim} bold>/</Text>
              <Text color={t.muted}> cmds {G.bullet} </Text>
              <Text color={t.accentDim} bold>ctrl+o</Text>
              <Text color={t.muted}> details{verbose ? '*' : ''} {G.bullet} </Text>
              <Text color={t.accentDim} bold>esc</Text>
              <Text color={t.muted}> cancel {G.bullet} </Text>
              <Text color={t.accentDim} bold>ctrl+c</Text>
              <Text color={t.muted}> exit</Text>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
