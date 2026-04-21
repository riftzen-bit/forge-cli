import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Static, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
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
import { AgentClient } from '../agent/client.js';
import { AgentPool } from '../agent/pool.js';
import { runSubagent } from '../agent/subagent.js';
import { TodoStore, formatTodoSummary, type Todo } from '../agent/todos.js';
import { TodoList } from './TodoList.js';
import { handleSlash } from '../commands/slash.js';
import { CONTEXT_LIMIT, WARN_THRESHOLD } from '../agent/contextBudget.js';
import { filterCommands, expand } from '../commands/registry.js';
import { labelFor, resolveModel } from '../agent/models.js';
import { DEFAULT_EFFORT, type Effort } from '../agent/effort.js';
import { saveSettings } from '../config/settings.js';
import type { SessionSummary } from '../session/store.js';
import type { AuthStatus } from '../auth/status.js';
import { pickThinkingLabel } from './thinkingLabels.js';
import type { Settings } from '../config/settings.js';

type PickerMode = 'none' | 'model' | 'effort' | 'resume';

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
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [activeModel, setActiveModel] = useState(resolveModel(model));
  const [activeEffort, setActiveEffort] = useState<Effort>(effort ?? DEFAULT_EFFORT);
  const [picker, setPicker] = useState<PickerMode>('none');
  const [thinking, setThinking] = useState('');
  const [busyLabel, setBusyLabel] = useState<string | undefined>(undefined);
  const [verbose, setVerbose] = useState(false);
  const thinkingBufRef = useRef('');
  const [client] = useState(() => new AgentClient({
    model,
    effort: effort ?? DEFAULT_EFFORT,
    permissionRules: settings?.permissionRules,
    hooks: settings?.hooks,
    mcpServers: settings?.mcpServers,
  }));
  const [pool] = useState(() => new AgentPool());
  const [todoStore] = useState(() => new TodoStore());
  const [todos, setTodos] = useState<Todo[]>([]);
  const [planMode, setPlanMode] = useState(false);
  const [tokens, setTokens] = useState(0);

  useEffect(() => todoStore.subscribe(setTodos), [todoStore]);

  const palette = useMemo(() => filterCommands(input), [input]);
  const paletteOpen = palette.length > 0 && input.startsWith('/') && !busy && picker === 'none';

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

  const applyModel = async (id: string) => {
    client.setModel(id);
    setActiveModel(id);
    setPicker('none');
    setMessages((m) => [...m, { role: 'system', text: `model → ${labelFor(id)}` }]);
    try {
      await saveSettings({ defaultModel: id });
    } catch {
      /* persistence best-effort */
    }
  };

  const applyEffort = async (e: Effort) => {
    client.setEffort(e);
    setActiveEffort(e);
    setPicker('none');
    setMessages((m) => [...m, { role: 'system', text: `effort → ${e}` }]);
    try {
      await saveSettings({ effort: e });
    } catch {
      /* persistence best-effort */
    }
  };

  const runCompact = async () => {
    setMessages((m) => [...m, { role: 'system', text: 'compacting…' }]);
    setBusy(true);
    setBusyLabel('compacting');
    try {
      await client.compact({
        onTokens: setTokens,
        onCompactRun: (before, after) => {
          setMessages((m) => [
            ...m,
            { role: 'system', text: `compacted · ${before.toLocaleString()} → ${after.toLocaleString()} tok` },
          ]);
        },
      });
      setTokens(client.getTokenTotal());
    } catch (err) {
      setMessages((m) => [...m, { role: 'error', text: (err as Error).message }]);
    } finally {
      setBusy(false);
      setBusyLabel(undefined);
    }
  };

  const togglePlan = (): string => {
    const next = !planMode;
    setPlanMode(next);
    client.setPlanMode(next);
    return next ? 'plan mode on · no edits will execute' : 'plan mode off';
  };

  const runTask = async (task: string) => {
    setMessages((m) => [
      ...m,
      { role: 'system', text: `spawning subagent for: ${task}` },
    ]);
    setBusy(true);
    setBusyLabel(pickThinkingLabel());
    try {
      const reply = await runSubagent(task, { model: activeModel, effort: activeEffort }, {
        onTool: (t) => {
          const preview = summarizeInput(t.name, t.input, cwd);
          setMessages((m) => [...m, { role: 'tool', tool: `[sub] ${t.name}`, text: preview, input: t.input }]);
        },
      });
      setMessages((m) => [...m, { role: 'assistant', text: `[sub] ${reply}` }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'error', text: (err as Error).message }]);
    } finally {
      setBusy(false);
      setBusyLabel(undefined);
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
        const t = todoStore.add(tail);
        return `added #${t.id}: ${t.text}`;
      }
      case 'done':
      case 'doing':
      case 'pending': {
        const id = Number(tail);
        if (!Number.isFinite(id)) return `usage: /todo ${sub} <id>`;
        const ok = todoStore.setStatus(id, sub as 'done' | 'doing' | 'pending');
        return ok ? `#${id} → ${sub}` : `no todo #${id}`;
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
    setMessages((m) => [
      ...m,
      { role: 'system', text: `running ${tasks.length} agents concurrently` },
      ...tasks.map((t, i) => ({ role: 'user' as const, text: `[A${i + 1}] ${t}` })),
    ]);
    setBusy(true);
    setBusyLabel(pickThinkingLabel());
    thinkingBufRef.current = '';
    setThinking('');

    try {
      await pool.runParallel(
        tasks,
        { model: activeModel, effort: activeEffort },
        (_i, tag, ev) => {
          if (ev.kind === 'tool') {
            const preview = summarizeInput(ev.tool, ev.input, cwd);
            setMessages((m) => [
              ...m,
              { role: 'tool', tool: `[${tag}] ${ev.tool}`, text: preview, input: ev.input },
            ]);
          } else if (ev.kind === 'done') {
            setMessages((m) => [...m, { role: 'assistant', text: `[${tag}] ${ev.reply}` }]);
          } else if (ev.kind === 'error') {
            setMessages((m) => [...m, { role: 'error', text: `[${tag}] ${ev.message}` }]);
          } else if (ev.kind === 'thinking') {
            thinkingBufRef.current += ev.delta;
            setThinking(thinkingBufRef.current);
          }
        },
      );
    } finally {
      setBusy(false);
      setBusyLabel(undefined);
      setThinking('');
    }
  };

  const applyResume = (s: SessionSummary) => {
    client.queueResume(s.id);
    setPicker('none');
    setMessages((m) => [
      ...m,
      { role: 'system', text: `resuming session ${s.id.slice(0, 8)} · next message continues it` },
    ]);
  };

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput('');
    setCursor(0);

    if (trimmed.startsWith('/')) {
      const result = await handleSlash(trimmed, {
        onExit: () => { onExit(); exit(); },
        openModelPicker: () => setPicker('model'),
        openEffortPicker: () => setPicker('effort'),
        openResumePicker: () => setPicker('resume'),
        runParallel: (tasks) => { void runParallel(tasks); },
        togglePlan,
        runTask: (t) => { void runTask(t); },
        todo: handleTodo,
        compact: () => { void runCompact(); },
      });
      if (result) setMessages((m) => [...m, { role: 'system', text: result }]);
      return;
    }

    setMessages((m) => [...m, { role: 'user', text: trimmed }]);
    setBusy(true);
    setBusyLabel(pickThinkingLabel());
    thinkingBufRef.current = '';
    setThinking('');

    try {
      const reply = await client.send(trimmed, {
        onThinking: (delta) => {
          thinkingBufRef.current += delta;
          setThinking(thinkingBufRef.current);
        },
        onTool: (t) => {
          const preview = summarizeInput(t.name, t.input, cwd);
          setMessages((m) => [...m, { role: 'tool', tool: t.name, text: preview, input: t.input }]);
        },
        onTokens: setTokens,
        onCompactWarn: (total) => {
          const pct = Math.round((total / CONTEXT_LIMIT) * 100);
          setMessages((m) => [
            ...m,
            { role: 'system', text: `context at ${pct}% (${total.toLocaleString()} tok). auto-compact triggers at 180k` },
          ]);
        },
        onCompactRun: (before, after) => {
          setMessages((m) => [
            ...m,
            { role: 'system', text: `auto-compacted · ${before.toLocaleString()} → ${after.toLocaleString()} tok` },
          ]);
        },
      });
      if (thinkingBufRef.current.trim()) {
        const full = thinkingBufRef.current.replace(/\s+/g, ' ').trim();
        setMessages((m) => [...m, { role: 'thinking', text: full }]);
      }
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'error', text: (err as Error).message }]);
    } finally {
      setBusy(false);
      setBusyLabel(undefined);
      setThinking('');
    }
  };

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

  type StaticItem =
    | { kind: 'banner' }
    | { kind: 'tips' }
    | { kind: 'msg'; m: ChatMessage };
  const staticItems: StaticItem[] = [
    { kind: 'banner' },
    { kind: 'tips' },
    ...messages.map((m) => ({ kind: 'msg' as const, m })),
  ];

  return (
    <>
      <Static items={staticItems}>
        {(item, i) => {
          if (item.kind === 'banner') return <Banner key={i} />;
          if (item.kind === 'tips') return <Tips key={i} />;
          return <MessageRow key={i} message={item.m} verbose={verbose} />;
        }}
      </Static>
      <Box flexDirection="column">
        {busy && busyLabel && (
          <ThinkingLine label={busyLabel} text={thinking} verbose={verbose} />
        )}
        <TodoList todos={todos} />
        <StatusBar model={activeModel} effort={activeEffort} auth={auth} cwd={cwd} planMode={planMode} tokens={tokens} tokenLimit={CONTEXT_LIMIT} template={settings?.statusLine} />
        <Box
          borderStyle="round"
          borderColor={busy ? 'gray' : planMode ? 'yellow' : 'cyan'}
          paddingX={1}
        >
          <Text color={busy ? 'gray' : 'cyan'} bold>❯ </Text>
          {busy ? (
            <Text dimColor>working…</Text>
          ) : (
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={submit}
              placeholder="ask forge to build, edit, or explain something…"
            />
          )}
        </Box>
        {paletteOpen && <CommandPalette commands={palette} cursor={cursor} />}
        <Box paddingX={2}>
          <Text dimColor>enter send · / commands · Ctrl+O details{verbose ? ' on' : ''} · esc cancel · ctrl-c exit</Text>
        </Box>
      </Box>
    </>
  );
}

function toRelative(full: string, cwd: string): string {
  const root = cwd.replace(/[\\/]+$/, '');
  const norm = full.replace(/\\/g, '/');
  const rootNorm = root.replace(/\\/g, '/');
  if (norm.toLowerCase().startsWith(rootNorm.toLowerCase())) {
    const rel = norm.slice(rootNorm.length).replace(/^\/+/, '');
    return rel || '.';
  }
  const parts = norm.split('/').filter(Boolean);
  return parts.slice(-2).join('/');
}

function summarizeInput(tool: string, input: Record<string, unknown>, cwd: string): string {
  const pathKeys = ['file_path', 'path', 'notebook_path'];
  for (const k of pathKeys) {
    const v = input[k];
    if (typeof v === 'string' && v.trim()) {
      const rel = toRelative(v, cwd);
      const range = typeof input['offset'] === 'number' && typeof input['limit'] === 'number'
        ? `  L${input['offset']}-${(input['offset'] as number) + (input['limit'] as number)}`
        : '';
      return rel + range;
    }
  }
  if (tool === 'Bash' && typeof input['command'] === 'string') {
    const c = (input['command'] as string).replace(/\s+/g, ' ').trim();
    return c.length > 70 ? c.slice(0, 69) + '…' : c;
  }
  for (const k of ['pattern', 'query', 'url']) {
    const v = input[k];
    if (typeof v === 'string' && v.trim()) {
      return v.length > 70 ? v.slice(0, 69) + '…' : v;
    }
  }
  const entries = Object.entries(input).slice(0, 1);
  if (!entries.length) return '';
  const [k, v] = entries[0]!;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return `${k}=${s.length > 50 ? s.slice(0, 49) + '…' : s}`;
}
