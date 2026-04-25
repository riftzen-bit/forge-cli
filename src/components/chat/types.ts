// Shared type definitions for ChatScreen and its sub-modules.
// Extracted from ChatScreen.tsx so hooks and panels can share them
// without creating a circular import back to the main component.

import type { ToolStartEvent, ToolResultEvent } from '../../agent/client.js';
import type { ChatMessage } from '../MessageList.js';

// Which full-screen picker overlay is currently open. 'none' means the
// normal chat view is visible.
export type PickerMode = 'none' | 'model' | 'effort' | 'resume' | 'provider' | 'login';

// Running totals for the current session. Stored in a ref because updating
// on every usage delta would re-render the whole tree.
export type SessionStats = {
  turns: number;
  toolCalls: Record<string, number>;
  startedAt: number;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCostUsd: number;
};

// One currently-executing tool call shown in the ActiveToolsPanel.
export type ActiveTool = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  startedAt: number;
  tag?: string;
};

// Live streaming preview for a spawned subagent. Kept in a Map keyed by tag
// and flushed to state at an interval to avoid per-token re-renders.
export type SubPreview = {
  tag: string;
  thinking: string;
  text: string;
  startedAt: number;
};

// Items rendered into Ink's <Static> list (scrollback). Banner and Tips are
// singletons; msg wraps a ChatMessage so React key stability survives across
// re-renders.
export type StaticItem =
  | { kind: 'banner'; id: string }
  | { kind: 'tips'; id: string }
  | { kind: 'msg'; id: string; message: ChatMessage };

// Handler shapes used by the agent client and spawn server.
export type ToolHandler = (ev: ToolStartEvent, tag?: string) => void;
export type ToolResultHandler = (r: ToolResultEvent, tag?: string) => void;
