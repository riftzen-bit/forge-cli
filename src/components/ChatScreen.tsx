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
import { StatusBar } from './StatusBar.js';
import type { ChatMessage } from './MessageList.js';
import { AgentClient, type ToolStartEvent, type ToolResultEvent } from '../agent/client.js';
import { AgentPool } from '../agent/pool.js';
import { runSubagent } from '../agent/subagent.js';
import { FileCoordinator } from '../agent/fileLocks.js';
import { createSpawnServer } from '../agent/spawnServer.js';
import { TodoStore, formatTodoSummary, type Todo } from '../agent/todos.js';
import { TodoList } from './TodoList.js';
import { handleSlash } from '../commands/slash.js';
import { CONTEXT_LIMIT } from '../agent/contextBudget.js';
import { filterCommands, expand } from '../commands/registry.js';
import { labelFor, resolveModel } from '../agent/models.js';
import { DEFAULT_EFFORT, type Effort } from '../agent/effort.js';
import { saveSettings } from '../config/settings.js';
import type { SessionSummary } from '../session/store.js';
import type { AuthStatus } from '../auth/status.js';
import type { Settings } from '../config/settings.js';
import { getTheme } from '../ui/theme.js';
import { displayName, prettyArgs } from './toolFormat.js';

type PickerMode = 'none' | 'model' | 'effort' | 'resume';

type ActiveTool = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  startedAt: number;
  tag?: string;
};

const THINKING_FLUSH_MS = 80;

type Props = {
  model: string;
  effort?: Effort;
  auth: AuthStatus;
  cwd: string;
  oneShot?: string;
  settings?: Settings;
  onExit: () => void;
};

export function ChatScreen({ model, effort, auth, cwd, oneShot, settings, onExit }: Props) {
  const { exit } = useApp();
  const t = getTheme();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyStartedAt, setBusyStartedAt] = useState<number | undefined>();
  const [cursor, setCursor] = useState(0);
  const [activeModel, setActiveModel] = useState(resolveModel(model));
  const [activeEffort, setActiveEffort] = useState<Effort>(effort ?? DEFAULT_EFFORT);
  const [picker, setPicker] = useState<PickerMode>('none');
  const [thinking, setThinking] = useState('');
  const [verbose, setVerbose] = useState(false);
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [planMode, setPlanMode] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [renderEpoch, setRenderEpoch] = useState(0);
  const [queue, setQueue] = useState<string[]>([]);

  const thinkingAccumRef = useRef('');
  const thinkingPendingRef = useRef(false);
  const activeToolsMapRef = useRef<Map<string, ActiveTool>>(new Map());
  const subStatsRef = useRef<Map<string, { count: number; startedAt: number }>>(new Map());
  const queueRef = useRef<string[]>([]);
  const submitRef = useRef<(text: string) => Promise<void>>(async () => {});
  const prevBusyRef = useRef(false);
  const busyRef = useRef(false);
  const spawnHandlersRef = useRef<{
    onToolStart: (ev: ToolStartEvent, tag?: string) => void;
    onToolResult: (r: ToolResultEvent, tag?: string) => void;
    appendHistory: (m: ChatMessage) => void;
    getModel: () => string;
    getEffort: () => Effort;
  }>({
    onToolStart: () => {},
    onToolResult: () => {},
    appendHistory: () => {},
    getModel: () => model,
    getEffort: () => effort ?? DEFAULT_EFFORT,
  });

  const [coordinator] = useState(() => new FileCoordinator());
  const [pool] = useState(() => new AgentPool(coordinator));
  const [client] = useState(() => {
    const spawn = createSpawnServer({
      coordinator,
      getModel: () => spawnHandlersRef.current.getModel(),
      getEffort: () => spawnHandlersRef.current.getEffort(),
      onEvent: (tag, ev) => {
        if (ev.kind === 'toolStart') {
          spawnHandlersRef.current.onToolStart(
            { id: ev.id, name: ev.tool, input: ev.input },
            tag,
          );
        } else if (ev.kind === 'toolResult') {
          spawnHandlersRef.current.onToolResult(
            { id: ev.id, ok: ev.ok, ms: ev.ms, preview: ev.preview, lines: ev.lines },
            tag,
          );
        } else if (ev.kind === 'thinking') {
          handleThinking(ev.delta);
        } else if (ev.kind === 'done') {
          const s = subStatsRef.current.get(tag);
          subStatsRef.current.delete(tag);
          const secs = s ? ((Date.now() - s.startedAt) / 1000).toFixed(1) : '?';
          const n = s?.count ?? 0;
          const chars = ev.reply.length;
          spawnHandlersRef.current.appendHistory({
            role: 'system',
            text: `[${tag}] done  ${n} tool${n === 1 ? '' : 's'}  ${secs}s  ${chars} chars`,
          });
        } else if (ev.kind === 'error') {
          subStatsRef.current.delete(tag);
          spawnHandlersRef.current.appendHistory({
            role: 'error',
            text: `[${tag}] ${ev.message}`,
          });
        }
      },
    });
    return new AgentClient({
      model,
      effort: effort ?? DEFAULT_EFFORT,
      locks: coordinator,
      permissionRules: settings?.permissionRules,
      hooks: settings?.hooks,
      mcpServers: { ...(settings?.mcpServers ?? {}), ...spawn.servers },
      extraAllowedTools: spawn.allowedTools,
    });
  });
  const [todoStore] = useState(() => new TodoStore());

  useEffect(() => todoStore.subscribe(setTodos), [todoStore]);

  useEffect(() => {
    const onResize = () => {
      setRenderEpoch((n) => n + 1);
    };
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => {
      if (thinkingPendingRef.current) {
        setThinking(thinkingAccumRef.current);
        thinkingPendingRef.current = false;
      }
    }, THINKING_FLUSH_MS);
    return () => clearInterval(id);
  }, [busy]);

  const palette = useMemo(() => filterCommands(input), [input]);
  const paletteOpen = palette.length > 0 && input.startsWith('/') && picker === 'none';

  useEffect(() => {
    if (cursor >= palette.length) setCursor(0);
  }, [palette.length, cursor]);

  useInput((ch, key) => {
    if (picker !== 'none') return;
    if (key.ctrl && ch === 'o') {
      setVerbose((v) => !v);
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

  const handleTokens = (total: number) => {
    setTokens(total);
  };

  const handleThinking = (delta: string) => {
    thinkingAccumRef.current += delta;
    thinkingPendingRef.current = true;
  };

  const commitActiveTools = () => {
    setActiveTools([...activeToolsMapRef.current.values()]);
  };

  const handleToolStart = (ev: ToolStartEvent, tag?: string) => {
    const now = Date.now();
    activeToolsMapRef.current.set(ev.id, {
      id: ev.id,
      name: ev.name,
      input: ev.input,
      startedAt: now,
      tag,
    });
    if (tag && !subStatsRef.current.has(tag)) {
      subStatsRef.current.set(tag, { count: 0, startedAt: now });
    }
    commitActiveTools();
  };

  const handleToolResult = (res: ToolResultEvent, tag?: string) => {
    const at = activeToolsMapRef.current.get(res.id);
    activeToolsMapRef.current.delete(res.id);
    commitActiveTools();
    if (!at) return;
    if (tag) {
      const s = subStatsRef.current.get(tag) ?? { count: 0, startedAt: at.startedAt };
      s.count += 1;
      subStatsRef.current.set(tag, s);
      return;
    }
    const meta = res.lines !== undefined ? { lines: res.lines } : {};
    setHistory((h) => [
      ...h,
      {
        role: 'tool',
        tool: at.name,
        input: at.input,
        text: prettyArgs(at.name, at.input, cwd, meta),
        id: res.id,
        status: res.ok ? 'ok' : 'err',
        ms: res.ms,
        output: res.preview,
      },
    ]);
  };

  spawnHandlersRef.current = {
    onToolStart: handleToolStart,
    onToolResult: handleToolResult,
    appendHistory: (msg) => setHistory((h) => [...h, msg]),
    getModel: () => activeModel,
    getEffort: () => activeEffort,
  };

  const beginBusy = () => {
    busyRef.current = true;
    setBusy(true);
    setBusyStartedAt(Date.now());
    thinkingAccumRef.current = '';
    thinkingPendingRef.current = false;
    setThinking('');
  };

  const flushThinkingToHistory = () => {
    if (thinkingAccumRef.current.trim()) {
      const full = thinkingAccumRef.current.replace(/\s+/g, ' ').trim();
      setHistory((m) => [...m, { role: 'thinking', text: full }]);
    }
    thinkingAccumRef.current = '';
    thinkingPendingRef.current = false;
  };

  const endBusy = () => {
    busyRef.current = false;
    setBusy(false);
    setBusyStartedAt(undefined);
    setThinking('');
    activeToolsMapRef.current.clear();
    commitActiveTools();
  };

  const applyModel = async (id: string) => {
    client.setModel(id);
    setActiveModel(id);
    setPicker('none');
    setHistory((m) => [...m, { role: 'system', text: `model -> ${labelFor(id)}` }]);
    try {
      await saveSettings({ defaultModel: id });
    } catch { /* best-effort */ }
  };

  const applyEffort = async (e: Effort) => {
    client.setEffort(e);
    setActiveEffort(e);
    setPicker('none');
    setHistory((m) => [...m, { role: 'system', text: `effort -> ${e}` }]);
    try {
      await saveSettings({ effort: e });
    } catch { /* best-effort */ }
  };

  const runCompact = async () => {
    setHistory((m) => [...m, { role: 'system', text: 'compacting...' }]);
    beginBusy();
    try {
      await client.compact({
        onTokens: handleTokens,
        onCompactRun: (before, after) => {
          setHistory((m) => [
            ...m,
            { role: 'system', text: `compacted ${before.toLocaleString()} -> ${after.toLocaleString()} tok` },
          ]);
        },
      });
      setTokens(client.getTokenTotal());
    } catch (err) {
      setHistory((m) => [...m, { role: 'error', text: (err as Error).message }]);
    } finally {
      endBusy();
    }
  };

  const togglePlan = (): string => {
    const next = !planMode;
    setPlanMode(next);
    client.setPlanMode(next);
    return next ? 'plan mode on -- no edits will execute' : 'plan mode off';
  };

  const runTask = async (task: string) => {
    setHistory((m) => [...m, { role: 'system', text: `spawning subagent: ${task}` }]);
    beginBusy();
    try {
      const reply = await runSubagent(task, { model: activeModel, effort: activeEffort, locks: coordinator }, {
        onThinking: handleThinking,
        onToolStart: (ev) => handleToolStart(ev, 'sub'),
        onToolResult: (r) => handleToolResult(r, 'sub'),
      });
      flushThinkingToHistory();
      setHistory((m) => [...m, { role: 'assistant', text: `[sub] ${reply}` }]);
    } catch (err) {
      setHistory((m) => [...m, { role: 'error', text: (err as Error).message }]);
    } finally {
      endBusy();
    }
  };

  const handleTodo = (args: string): string => {
    const [sub, ...rest] = args.trim().split(/\s+/);
    const tail = rest.join(' ').trim();
    switch (sub) {
      case '':
      case 'list':
        return formatTodoSummary(todoStore.list());
      case 'add': {
        if (!tail) return 'usage: /todo add <text>';
        const td = todoStore.add(tail);
        return `added #${td.id}: ${td.text}`;
      }
      case 'done':
      case 'doing':
      case 'pending': {
        const id = Number(tail);
        if (!Number.isFinite(id)) return `usage: /todo ${sub} <id>`;
        const ok = todoStore.setStatus(id, sub as 'done' | 'doing' | 'pending');
        return ok ? `#${id} -> ${sub}` : `no todo #${id}`;
      }
      case 'rm': {
        const id = Number(tail);
        if (!Number.isFinite(id)) return 'usage: /todo rm <id>';
        return todoStore.remove(id) ? `removed #${id}` : `no todo #${id}`;
      }
      case 'clear':
        todoStore.clear();
        return 'todos cleared';
      default:
        return `unknown todo op: ${sub}`;
    }
  };

  const runParallel = async (tasks: string[]) => {
    setHistory((m) => [
      ...m,
      { role: 'system', text: `running ${tasks.length} agents concurrently` },
      ...tasks.map((td, i) => ({ role: 'user' as const, text: `[A${i + 1}] ${td}` })),
    ]);
    beginBusy();

    try {
      await pool.runParallel(
        tasks,
        { model: activeModel, effort: activeEffort },
        (_i, tag, ev) => {
          if (ev.kind === 'toolStart') {
            handleToolStart({ id: ev.id, name: ev.tool, input: ev.input }, tag);
          } else if (ev.kind === 'toolResult') {
            handleToolResult({ id: ev.id, ok: ev.ok, ms: ev.ms, preview: ev.preview, lines: ev.lines }, tag);
          } else if (ev.kind === 'done') {
            const s = subStatsRef.current.get(tag);
            subStatsRef.current.delete(tag);
            const secs = s ? ((Date.now() - s.startedAt) / 1000).toFixed(1) : '?';
            const n = s?.count ?? 0;
            const firstLine = ev.reply.split(/\r?\n/, 1)[0] ?? '';
            const digest = firstLine.length > 140 ? firstLine.slice(0, 137) + '...' : firstLine;
            setHistory((m) => [
              ...m,
              { role: 'system', text: `[${tag}] done  ${n} tool${n === 1 ? '' : 's'}  ${secs}s` },
              { role: 'assistant', text: `[${tag}] ${digest}` },
            ]);
          } else if (ev.kind === 'error') {
            subStatsRef.current.delete(tag);
            setHistory((m) => [...m, { role: 'error', text: `[${tag}] ${ev.message}` }]);
          } else if (ev.kind === 'thinking') {
            handleThinking(ev.delta);
          }
        },
      );
      flushThinkingToHistory();
    } finally {
      endBusy();
    }
  };

  const applyResume = (s: SessionSummary) => {
    client.queueResume(s.id);
    setPicker('none');
    setHistory((m) => [
      ...m,
      { role: 'system', text: `resuming ${s.id.slice(0, 8)} -- next message continues it` },
    ]);
  };

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput('');
    setCursor(0);

    if (busyRef.current) {
      queueRef.current.push(trimmed);
      setQueue([...queueRef.current]);
      return;
    }

    if (trimmed.startsWith('/')) {
      const result = await handleSlash(trimmed, {
        onExit: () => { onExit(); exit(); },
        openModelPicker: () => setPicker('model'),
        openEffortPicker: () => setPicker('effort'),
        openResumePicker: () => setPicker('resume'),
        runParallel: (tasks) => { void runParallel(tasks); },
        togglePlan,
        runTask: (td) => { void runTask(td); },
        todo: handleTodo,
        compact: () => { void runCompact(); },
      });
      if (result) setHistory((m) => [...m, { role: 'system', text: result }]);
      return;
    }

    setHistory((m) => [...m, { role: 'user', text: trimmed }]);
    beginBusy();

    try {
      const reply = await client.send(trimmed, {
        onThinking: handleThinking,
        onToolStart: (ev) => handleToolStart(ev),
        onToolResult: (r) => handleToolResult(r),
        onTokens: handleTokens,
        onCompactWarn: (total) => {
          const pct = Math.round((total / CONTEXT_LIMIT) * 100);
          setHistory((m) => [
            ...m,
            { role: 'system', text: `context at ${pct}% (${total.toLocaleString()} tok), auto-compact at 180k` },
          ]);
        },
        onCompactRun: (before, after) => {
          setHistory((m) => [
            ...m,
            { role: 'system', text: `auto-compacted ${before.toLocaleString()} -> ${after.toLocaleString()} tok` },
          ]);
        },
      });
      flushThinkingToHistory();
      setHistory((m) => [...m, { role: 'assistant', text: reply }]);
    } catch (err) {
      setHistory((m) => [...m, { role: 'error', text: (err as Error).message }]);
    } finally {
      endBusy();
    }
  };

  submitRef.current = submit;

  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = busy;
    if (wasBusy && !busy && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      setQueue([...queueRef.current]);
      void submitRef.current(next);
    }
  }, [busy]);

  useEffect(() => {
    if (oneShot) {
      void (async () => {
        await submit(oneShot);
        onExit();
        exit();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (picker === 'model') {
    return (
      <ModelSelector
        current={activeModel}
        onSelect={(id) => void applyModel(id)}
        onCancel={() => setPicker('none')}
      />
    );
  }
  if (picker === 'effort') {
    return (
      <EffortSelector
        current={activeEffort}
        onSelect={(e) => void applyEffort(e)}
        onCancel={() => setPicker('none')}
      />
    );
  }
  if (picker === 'resume') {
    return (
      <ResumeSelector
        onSelect={applyResume}
        onCancel={() => setPicker('none')}
      />
    );
  }

  const promptColor = busy ? t.muted : planMode ? t.planMode : t.accent;

  type StaticItem =
    | { kind: 'banner'; id: string }
    | { kind: 'tips'; id: string }
    | { kind: 'msg'; id: string; message: ChatMessage };
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
      <Box flexDirection="column">
        {activeTools.length > 0 && (
          <ActiveToolsPanel tools={activeTools} cwd={cwd} verbose={verbose} />
        )}
        {busy && (
          <ThinkingLine text={thinking} verbose={verbose} startedAt={busyStartedAt} />
        )}
        <TodoList todos={todos} />
        {queue.length > 0 && (
          <Box flexDirection="column" paddingX={1}>
            <Text color={t.muted}>queued ({queue.length}) -- sends when agent idles</Text>
            {queue.map((q, i) => (
              <Text key={i} color={t.muted} wrap="truncate-end">  {i + 1}. {q}</Text>
            ))}
          </Box>
        )}
        <Box
          borderStyle="round"
          borderColor={promptColor}
          paddingX={1}
        >
          <Text color={promptColor} bold>{busy ? '.' : '>'} </Text>
          <SimpleTextInput
            value={input}
            onChange={setInput}
            onSubmit={submit}
            placeholder={busy ? 'type to queue -- sends when ready' : 'ask forge to build, edit, or explain'}
          />
        </Box>
        {paletteOpen && <CommandPalette commands={palette} cursor={cursor} />}
        <Box paddingX={1}>
          <StatusBar
            model={activeModel}
            effort={activeEffort}
            auth={auth}
            cwd={cwd}
            planMode={planMode}
            tokens={tokens}
            tokenLimit={CONTEXT_LIMIT}
            template={settings?.statusLine}
          />
        </Box>
        <Box paddingX={1}>
          <Text color={t.muted} wrap="truncate-end">
            enter send  /  commands  ctrl+o details{verbose ? '*' : ''}  esc cancel  ctrl+c exit
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];

function useTick(ms: number) {
  const [frame, setFrame] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
      setNow(Date.now());
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
  return { frame, now };
}

const COMPACT_VISIBLE = 3;

function ActiveToolRow({
  tool,
  elapsed,
  spinnerFrame,
  cwd,
  showSpinner,
}: {
  tool: ActiveTool;
  elapsed: string;
  spinnerFrame: string;
  cwd: string;
  showSpinner: boolean;
}) {
  const t = getTheme();
  const name = displayName(tool.name);
  const args = prettyArgs(tool.name, tool.input, cwd);
  const prefix = tool.tag ? `[${tool.tag}] ` : '';
  return (
    <Box>
      <Text wrap="truncate-end">
        {showSpinner ? (
          <Text color={t.warn}>{spinnerFrame} </Text>
        ) : (
          <Text color={t.muted}>  </Text>
        )}
        <Text color={t.muted}>{prefix}</Text>
        <Text color={t.toolTag} bold>{name}</Text>
        <Text color={t.text}>({args})</Text>
        <Text color={t.muted}>  {elapsed}s</Text>
      </Text>
    </Box>
  );
}

function ActiveToolsPanel({
  tools,
  cwd,
  verbose,
}: {
  tools: ActiveTool[];
  cwd: string;
  verbose: boolean;
}) {
  const t = getTheme();
  const { frame, now } = useTick(160);
  const spinner = SPINNER_FRAMES[frame] ?? '';

  if (verbose) {
    return (
      <Box flexDirection="column">
        {tools.map((tool, i) => (
          <ActiveToolRow
            key={tool.id}
            tool={tool}
            elapsed={((now - tool.startedAt) / 1000).toFixed(1)}
            spinnerFrame={spinner}
            cwd={cwd}
            showSpinner={i === 0}
          />
        ))}
      </Box>
    );
  }

  const visible = tools.slice(-COMPACT_VISIBLE);
  const hidden = tools.length - visible.length;
  return (
    <Box flexDirection="column">
      {visible.map((tool, i) => (
        <ActiveToolRow
          key={tool.id}
          tool={tool}
          elapsed={((now - tool.startedAt) / 1000).toFixed(1)}
          spinnerFrame={spinner}
          cwd={cwd}
          showSpinner={i === 0}
        />
      ))}
      {hidden > 0 && (
        <Box>
          <Text color={t.muted}>  ... +{hidden} tool use{hidden === 1 ? '' : 's'} (ctrl+o to expand)</Text>
        </Box>
      )}
    </Box>
  );
}
