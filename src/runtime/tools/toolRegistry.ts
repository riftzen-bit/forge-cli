import type { Mode } from '../../agent/fileLocks.js';
import type { ToolRequest } from '../events.js';

export type ToolLock = string | { key: string; mode?: Mode } | null | undefined;

// Executor receives an AbortSignal so long-running tools can cooperatively
// stop when the turn is cancelled. The signal is also wired to the per-tool
// timeout, so descriptors don't have to re-implement timeout cancellation.
export interface ToolExecuteContext {
  signal: AbortSignal;
}
export type ToolExecutor = (
  request: ToolRequest,
  context: ToolExecuteContext,
) => unknown | Promise<unknown>;

// Optional input validator. Return `true` to accept, `false` for a generic
// rejection, or a string for a custom error message. Async returns supported.
export type ToolValidator = (
  request: ToolRequest,
) => boolean | string | Promise<boolean | string>;

export interface ToolDescriptor {
  name: string;
  mutates?: boolean;
  lock?: ToolLock | ((request: ToolRequest) => ToolLock);
  execute: ToolExecutor;
  validate?: ToolValidator;
  // Hard timeout in ms. The executor's signal is aborted when it elapses.
  timeoutMs?: number;
  // Number of additional attempts after the first failure. Default 0 (no
  // retry). Each retry waits `retryBackoffMs * (attempt)` before re-running.
  // Aborted/cancelled errors are NEVER retried.
  retries?: number;
  retryBackoffMs?: number;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDescriptor>();
  constructor(descriptors: ToolDescriptor[] = []) {
    for (const descriptor of descriptors) this.register(descriptor);
  }
  register(descriptor: ToolDescriptor): void {
    this.tools.set(descriptor.name, descriptor);
  }
  lookup(name: string): ToolDescriptor | undefined {
    return this.tools.get(name);
  }
  size(): number {
    return this.tools.size;
  }
  list(): ToolDescriptor[] {
    return [...this.tools.values()];
  }
}
