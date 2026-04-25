// Wires every command factory into a single object that ChatScreen hands
// to the slash dispatcher. The hook re-builds the handlers each render so
// they close over the latest ctx; consumers that store handler references
// across renders should use the returned `commandsRef` indirection.

import { useMemo } from 'react';
import type { CommandCtx } from './commands/ctx.js';
import {
  makeApplyModel,
  makeApplyEffort,
  makeApplyResume,
  makeApplyProvider,
  makeRunCompact,
  makeTogglePlan,
  makeToggleYolo,
  makeToggleAutoAccept,
  makeCyclePermissionMode,
  makeHandleClearScreen,
} from './commands/session.js';
import {
  makeRunTaskWith,
  makeRunTask,
  makeRunParallel,
  makeHandleReview,
  makeHandleExplain,
  makeHandleTest,
  makeHandleCommit,
  makeHandleSecurityReview,
  makeHandlePR,
  makeHandleReviewPR,
} from './commands/agents.js';
import { makeHandleDiff } from './commands/git.js';
import {
  makeHandleStatus,
  makeHandleStats,
  makeHandleCost,
  makeHandleRetry,
  makeHandleTodo,
} from './commands/info.js';
import { makeHandleMcp } from './commands/mcp.js';
import { makeHandleShell } from './commands/shell.js';
import { makeHandlePaste } from './commands/paste.js';
import type { SessionSummary } from '../../session/store.js';
import type { Effort } from '../../agent/effort.js';

export type ChatCommands = {
  applyModel: (id: string) => Promise<void>;
  applyEffort: (e: Effort) => Promise<void>;
  applyResume: (s: SessionSummary) => Promise<void>;
  applyProvider: (id: string) => Promise<void>;
  runCompact: () => Promise<void>;
  togglePlan: () => string;
  toggleYolo: () => string;
  toggleAutoAccept: () => string;
  cyclePermissionMode: () => string;
  handleClearScreen: () => void;
  runTaskWith: (prompt: string, tag: string) => Promise<void>;
  runTask: (task: string) => Promise<void>;
  runParallel: (tasks: string[]) => Promise<void>;
  handleReview: (target: string) => Promise<void>;
  handleReviewPR: (num: string) => Promise<void>;
  handleSecurityReview: () => Promise<void>;
  handleExplain: (target: string) => Promise<void>;
  handleTest: (pattern: string) => Promise<void>;
  handleDiff: (target: string) => Promise<void>;
  handleCommit: () => Promise<void>;
  handlePR: (base: string) => Promise<void>;
  handleStatus: () => string;
  handleStats: () => string;
  handleCost: () => string;
  handleRetry: () => string;
  handleTodo: (args: string) => string;
  handleMcp: (args: string) => Promise<string>;
  handleShell: (command: string) => Promise<void>;
  handlePaste: () => Promise<string>;
};

export function useChatCommands(ctx: CommandCtx): ChatCommands {
  // useMemo is cosmetic here — ctx identity changes every render so the memo
  // always recomputes. Kept for clarity on intent: handlers are derived.
  return useMemo(() => {
    const runTaskWith = makeRunTaskWith(ctx);
    return {
      applyModel: makeApplyModel(ctx),
      applyEffort: makeApplyEffort(ctx),
      applyResume: makeApplyResume(ctx),
      applyProvider: makeApplyProvider(ctx),
      runCompact: makeRunCompact(ctx),
      togglePlan: makeTogglePlan(ctx),
      toggleYolo: makeToggleYolo(ctx),
      toggleAutoAccept: makeToggleAutoAccept(ctx),
      cyclePermissionMode: makeCyclePermissionMode(ctx),
      handleClearScreen: makeHandleClearScreen(ctx),
      runTaskWith,
      runTask: makeRunTask(ctx),
      runParallel: makeRunParallel(ctx),
      handleReview: makeHandleReview(ctx, runTaskWith),
      handleReviewPR: makeHandleReviewPR(ctx, runTaskWith),
      handleSecurityReview: makeHandleSecurityReview(ctx, runTaskWith),
      handleExplain: makeHandleExplain(ctx, runTaskWith),
      handleTest: makeHandleTest(ctx, runTaskWith),
      handleDiff: makeHandleDiff(ctx),
      handleCommit: makeHandleCommit(ctx),
      handlePR: makeHandlePR(ctx, runTaskWith),
      handleStatus: makeHandleStatus(ctx),
      handleStats: makeHandleStats(ctx),
      handleCost: makeHandleCost(ctx),
      handleRetry: makeHandleRetry(ctx),
      handleTodo: makeHandleTodo(ctx),
      handleMcp: makeHandleMcp(ctx),
      handleShell: makeHandleShell(ctx),
      handlePaste: makeHandlePaste(ctx),
    };
  }, [ctx]);
}
