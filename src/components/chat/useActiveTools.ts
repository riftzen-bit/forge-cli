// Tracks currently-executing tool calls and per-subagent tool statistics.
// Uses refs for the internal maps and commits to React state only when the
// visible list actually changes, so mid-stream state thrash is contained.

import { useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { ToolStartEvent, ToolResultEvent } from '../../agent/client.js';
import type { ChatMessage } from '../MessageList.js';
import type { ActiveTool, SessionStats, ToolHandler, ToolResultHandler } from './types.js';
import { prettyArgs } from '../toolFormat.js';

export type SubStats = { count: number; startedAt: number };

type Deps = {
  cwd: string;
  flushThinking: () => void;
  appendHistory: (msg: ChatMessage) => void;
  sessionStatsRef: MutableRefObject<SessionStats>;
};

export type ActiveToolsApi = {
  activeTools: ActiveTool[];
  // Raw subagent stats map. Callers that already hold a tag (e.g. the spawn
  // server's onEvent) mutate this directly to avoid round-tripping through
  // React state.
  subStatsRef: MutableRefObject<Map<string, SubStats>>;
  handleToolStart: ToolHandler;
  handleToolResult: ToolResultHandler;
  clearAll: () => void;
};

export function useActiveTools(deps: Deps): ActiveToolsApi {
  const { cwd, flushThinking, appendHistory, sessionStatsRef } = deps;

  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const activeToolsMapRef = useRef<Map<string, ActiveTool>>(new Map());
  const subStatsRef = useRef<Map<string, SubStats>>(new Map());

  const commit = () => {
    setActiveTools([...activeToolsMapRef.current.values()]);
  };

  const handleToolStart: ToolHandler = (ev: ToolStartEvent, tag) => {
    const now = Date.now();
    // Tool output becomes the next visible message; flush pending thinking
    // into the scrollback first so the reasoning shows before the tool call.
    flushThinking();
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
    const counts = sessionStatsRef.current.toolCalls;
    counts[ev.name] = (counts[ev.name] ?? 0) + 1;
    commit();
  };

  const handleToolResult: ToolResultHandler = (res: ToolResultEvent, tag) => {
    const at = activeToolsMapRef.current.get(res.id);
    activeToolsMapRef.current.delete(res.id);
    commit();
    if (!at) return;
    // Subagent-tagged tools are summarised later by the spawn-server's
    // onEvent done/error handler; only the main agent's tools go into
    // history here.
    if (tag) {
      const s = subStatsRef.current.get(tag) ?? { count: 0, startedAt: at.startedAt };
      s.count += 1;
      subStatsRef.current.set(tag, s);
      return;
    }
    const meta = res.lines !== undefined ? { lines: res.lines } : {};
    appendHistory({
      role: 'tool',
      tool: at.name,
      input: at.input,
      text: prettyArgs(at.name, at.input, cwd, meta),
      id: res.id,
      status: res.ok ? 'ok' : 'err',
      ms: res.ms,
      output: res.preview,
    });
  };

  const clearAll = () => {
    activeToolsMapRef.current.clear();
    commit();
  };

  return {
    activeTools,
    subStatsRef,
    handleToolStart,
    handleToolResult,
    clearAll,
  };
}
