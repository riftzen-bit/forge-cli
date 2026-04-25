// The main submit flow: handles the user's input line, dispatches to shell
// (!cmd), slash (/cmd), or a model turn. Extracted from ChatScreen so the
// main component stays focused on rendering.

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { contextWindowFor } from '../../agent/models.js';
import { expandMentions } from '../../agent/mentions.js';
import { extractDataUrlImages } from '../../agent/imageInput.js';
import { classifyError } from '../../agent/errorClassify.js';
import { handleSlash } from '../../commands/slash.js';
import type { AgentClient } from '../../agent/client.js';
import type { InputHistory } from '../../agent/inputHistory.js';
import type { Settings } from '../../config/settings.js';
import type { ChatMessage } from '../MessageList.js';
import type { PickerMode, SessionStats, ToolHandler, ToolResultHandler } from './types.js';
import type { AgentTodo, UsageDelta } from '../../agent/client.js';
import type { ChatCommands } from './useChatCommands.js';
import type { TodoStore } from '../../agent/todos.js';

type Deps = {
  cwd: string;
  client: AgentClient;
  settings?: Settings;
  // State setters
  setInput: Dispatch<SetStateAction<string>>;
  setCursor: Dispatch<SetStateAction<number>>;
  setHistory: Dispatch<SetStateAction<ChatMessage[]>>;
  setPicker: (p: PickerMode) => void;
  setLoginInitialProvider?: (id: string | undefined) => void;
  setQueue: Dispatch<SetStateAction<string[]>>;
  // Refs
  busyRef: MutableRefObject<boolean>;
  queueRef: MutableRefObject<string[]>;
  lastUserMsgRef: MutableRefObject<string>;
  inputHistoryRef: MutableRefObject<InputHistory>;
  sessionStatsRef: MutableRefObject<SessionStats>;
  // Lifecycle
  beginBusy: () => void;
  endBusy: () => void;
  // Attachments
  bumpAttachmentTick?: () => void;
  // Stream handlers
  handleThinking: (delta: string) => void;
  handleText: (delta: string) => void;
  flushThinking: () => void;
  flushStreaming: (text?: string) => void;
  resetStreaming: () => void;
  // Tool handlers
  handleToolStart: ToolHandler;
  handleToolResult: ToolResultHandler;
  // Usage
  handleTokens: (total: number) => void;
  handleUsage: (u: UsageDelta) => void;
  // Agent-driven todo store
  todoStore: TodoStore;
  // Slash command handlers
  commands: ChatCommands;
  // Exits
  onExit: () => void;
  exit: () => void;
};

export function makeSubmit(deps: Deps) {
  return async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;

    deps.setInput('');
    deps.setCursor(0);
    deps.inputHistoryRef.current.resetCursor();

    // If another turn is already in flight, queue and bail. The queue drain
    // effect in ChatScreen pops one off when busy flips false.
    if (deps.busyRef.current) {
      deps.queueRef.current.push(trimmed);
      deps.setQueue([...deps.queueRef.current]);
      return;
    }

    if (trimmed.startsWith('!')) {
      const cmd = trimmed.slice(1).trim();
      if (!cmd) {
        deps.setHistory((m) => [...m, { role: 'system', text: 'usage: !<command>' }]);
        return;
      }
      if (deps.settings?.inputHistory?.enabled !== false) {
        void deps.inputHistoryRef.current.append(trimmed);
      }
      await deps.commands.handleShell(cmd);
      return;
    }

    if (trimmed.startsWith('/')) {
      const result = await handleSlash(trimmed, {
        cwd: deps.cwd,
        onExit: () => {
          deps.onExit();
          deps.exit();
        },
        openModelPicker: () => deps.setPicker('model'),
        openProviderPicker: () => deps.setPicker('provider'),
        openEffortPicker: () => deps.setPicker('effort'),
        openResumePicker: () => deps.setPicker('resume'),
        runParallel: (tasks) => {
          void deps.commands.runParallel(tasks);
        },
        togglePlan: deps.commands.togglePlan,
        toggleYolo: deps.commands.toggleYolo,
        toggleAutoAccept: deps.commands.toggleAutoAccept,
        cyclePermissionMode: deps.commands.cyclePermissionMode,
        runTask: (td) => {
          void deps.commands.runTask(td);
        },
        todo: deps.commands.handleTodo,
        compact: () => {
          void deps.commands.runCompact();
        },
        review: (t) => {
          void deps.commands.handleReview(t);
        },
        reviewPR: (n) => {
          void deps.commands.handleReviewPR(n);
        },
        securityReview: () => {
          void deps.commands.handleSecurityReview();
        },
        explain: (t) => {
          void deps.commands.handleExplain(t);
        },
        test: (p) => {
          void deps.commands.handleTest(p);
        },
        diff: (t) => {
          void deps.commands.handleDiff(t);
        },
        commit: () => {
          void deps.commands.handleCommit();
        },
        pr: (base) => {
          void deps.commands.handlePR(base);
        },
        status: deps.commands.handleStatus,
        stats: deps.commands.handleStats,
        cost: deps.commands.handleCost,
        retry: deps.commands.handleRetry,
        mcp: deps.commands.handleMcp,
        openLoginPicker: (provider) => {
          deps.setLoginInitialProvider?.(provider);
          deps.setPicker('login');
        },
        clearScreen: deps.commands.handleClearScreen,
      });
      if (result) deps.setHistory((m) => [...m, { role: 'system', text: result }]);
      if (deps.settings?.inputHistory?.enabled !== false) {
        void deps.inputHistoryRef.current.append(trimmed);
      }
      return;
    }

    // Regular model turn.
    if (deps.settings?.inputHistory?.enabled !== false) {
      void deps.inputHistoryRef.current.append(trimmed);
    }
    deps.lastUserMsgRef.current = trimmed;
    deps.sessionStatsRef.current.turns += 1;
    deps.setHistory((m) => [...m, { role: 'user', text: trimmed }]);
    deps.beginBusy();
    // Pending attachments will be drained by client.send(); refresh the
    // panel so the count drops to 0 immediately.
    deps.bumpAttachmentTick?.();

    let prompt = trimmed;
    try {
      const dataUrls = await extractDataUrlImages(trimmed);
      let working = dataUrls.text;
      if (dataUrls.saved.length > 0) {
        for (const p of dataUrls.saved) deps.client.attachImage(p);
        deps.setHistory((m) => [
          ...m,
          { role: 'system', text: `decoded ${dataUrls.saved.length} pasted image${dataUrls.saved.length === 1 ? '' : 's'}` },
        ]);
      }
      const expanded = await expandMentions(working, deps.cwd);
      prompt = expanded.prompt;
      if (expanded.files.length > 0) {
        deps.setHistory((m) => [
          ...m,
          {
            role: 'system',
            text: `attached ${expanded.files.length} file${expanded.files.length === 1 ? '' : 's'}: ${expanded.files.join(', ')}`,
          },
        ]);
      }
    } catch {
      /* mention expansion is best-effort */
    }

    try {
      await deps.client.send(prompt, {
        onThinking: deps.handleThinking,
        onText: deps.handleText,
        onTextBlockStart: deps.resetStreaming,
        onTextBlock: (text) => deps.flushStreaming(text),
        onToolStart: (ev) => deps.handleToolStart(ev),
        onToolResult: (r) => deps.handleToolResult(r),
        onTokens: deps.handleTokens,
        onUsage: deps.handleUsage,
        onTodos: (items: AgentTodo[]) => deps.todoStore.replaceFromAgent(items),
        onCompactWarn: (total) => {
          const limit = contextWindowFor(deps.client.getModel());
          const pct = Math.round((total / limit) * 100);
          deps.setHistory((m) => [
            ...m,
            {
              role: 'system',
              text: `context at ${pct}% (${total.toLocaleString()}/${limit.toLocaleString()} tok), auto-compact soon`,
            },
          ]);
        },
        onCompactRun: (before, after) => {
          deps.setHistory((m) => [
            ...m,
            {
              role: 'system',
              text: `auto-compacted ${before.toLocaleString()} -> ${after.toLocaleString()} tok`,
            },
          ]);
        },
      });
      deps.flushThinking();
      // Defensive: commit any trailing text that wasn't covered by an
      // assistant event (e.g. cancel mid-stream). Per-block commits already
      // happened via onTextBlock during the turn, so this is a no-op when
      // the buffer is empty.
      deps.flushStreaming();
    } catch (err) {
      const c = classifyError(err);
      const line = c.hint ? `${c.message}\n-> ${c.hint}` : c.message;
      deps.setHistory((m) => [...m, { role: 'error', text: line }]);
    } finally {
      deps.endBusy();
    }
  };
}
