// Shared context passed to every command factory. All ambient dependencies
// of the handlers live here, so the individual command modules stay pure
// factories: `make<Handler>(ctx) => handler`. The ChatScreen builds the ctx
// once per render and re-wires the handlers through the ref indirection in
// useChatCommands.

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AgentClient } from '../../../agent/client.js';
import type { AgentPool } from '../../../agent/pool.js';
import type { FileCoordinator } from '../../../agent/fileLocks.js';
import type { TodoStore } from '../../../agent/todos.js';
import type { Effort } from '../../../agent/effort.js';
import type { Settings, PermissionMode } from '../../../config/settings.js';
import type { AuthStatus } from '../../../auth/status.js';
import type { InputHistory } from '../../../agent/inputHistory.js';
import type { ChatMessage } from '../../MessageList.js';
import type { PickerMode, SessionStats, ToolHandler, ToolResultHandler } from '../types.js';
import type { SubStats } from '../useActiveTools.js';

export type CommandCtx = {
  // Static props
  cwd: string;
  settings?: Settings;
  auth: AuthStatus;
  onExit: () => void;
  exit: () => void;

  // Long-lived resources
  client: AgentClient;
  pool: AgentPool;
  coordinator: FileCoordinator;
  todoStore: TodoStore;

  // State getters (read current value even from old closures)
  getActiveModel: () => string;
  getActiveEffort: () => Effort;
  getActiveProvider: () => string;
  getPermissionMode: () => PermissionMode;
  getTokens: () => number;

  // State setters
  setActiveModel: (id: string) => void;
  setActiveEffort: (e: Effort) => void;
  setActiveProvider: (id: string) => void;
  setPermissionMode: (m: PermissionMode) => void;
  setTokens: (n: number) => void;
  setPicker: (p: PickerMode) => void;
  setRenderEpoch: Dispatch<SetStateAction<number>>;

  // History
  setHistory: Dispatch<SetStateAction<ChatMessage[]>>;
  appendHistory: (msg: ChatMessage) => void;

  // Stream buffers
  handleThinking: (delta: string) => void;
  flushThinking: () => void;
  pushSubDelta: (tag: string, field: 'thinking' | 'text', delta: string) => void;
  removeSubPreview: (tag: string) => void;

  // Tool tracking
  handleToolStart: ToolHandler;
  handleToolResult: ToolResultHandler;
  subStatsRef: MutableRefObject<Map<string, SubStats>>;
  sessionStatsRef: MutableRefObject<SessionStats>;

  // Busy lifecycle
  beginBusy: () => void;
  endBusy: () => void;

  // Other
  handleTokens: (total: number) => void;
  providerKeys: Set<string>;
  refreshProviderKeys: () => Promise<void>;
  bumpAttachmentTick: () => void;
  lastUserMsgRef: MutableRefObject<string>;
  inputHistoryRef: MutableRefObject<InputHistory>;
  submitRef: MutableRefObject<(text: string) => Promise<void>>;
};
