import { FileCoordinator, type Mode, type Release } from '../../agent/fileLocks.js';
import type { PermissionMode } from '../../config/settings.js';
import type { ToolRequest, ToolResult, TurnEvent } from '../events.js';
import type { ToolDescriptor, ToolLock, ToolRegistry } from './toolRegistry.js';

type PermissionDecision = { decision: 'allow' | 'deny'; message?: string };
type PermissionRequester = (
  request: ToolRequest,
) => Promise<PermissionDecision> | PermissionDecision;

// Hooks: beforeTool can throw to abort; onError fires on any failure path
// (validation, timeout, executor throw, after retries exhausted). afterTool
// only runs on a successful execution. All hooks are best-effort — a hook
// throwing is logged via the events array but never crashes the controller.
type BeforeHook = (request: ToolRequest) => void | Promise<void>;
type AfterHook = (request: ToolRequest, result: ToolResult, telemetry: ToolTelemetry) => void | Promise<void>;
type ErrorHook = (request: ToolRequest, error: Error, telemetry: ToolTelemetry) => void | Promise<void>;

export interface ToolTelemetry {
  toolName: string;
  toolCallId: string;
  attempts: number;
  durationMs: number;
  ok: boolean;
  // Reason classification — useful for both logging and the UI to show a
  // tailored error toast instead of a raw message.
  reason?:
    | 'unknown_tool'
    | 'duplicate_id'
    | 'plan_denied'
    | 'permission_denied'
    | 'validation_failed'
    | 'timed_out'
    | 'cancelled'
    | 'executor_error';
}

export interface ToolControllerOptions {
  registry: ToolRegistry;
  permissionMode?: PermissionMode;
  permissionRequester?: PermissionRequester;
  hooks?: {
    beforeTool?: BeforeHook;
    afterTool?: AfterHook;
    onError?: ErrorHook;
  };
  coordinator?: Pick<FileCoordinator, 'acquire'>;
  // Default timeout (ms) applied when a descriptor doesn't specify one.
  // Pass 0 / undefined to disable the default.
  defaultTimeoutMs?: number;
  // External signal that cancels every in-flight tool. Useful for wiring
  // the controller to the chat-level "esc cancels turn" gesture.
  signal?: AbortSignal;
  // Inject a clock for tests so we don't pay real wall-clock time on
  // timeout / retry-backoff branches.
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface ToolExecutionResult {
  ok: boolean;
  events: TurnEvent[];
  toolResult?: ToolResult;
  telemetry: ToolTelemetry;
}

const PLAN_DENIED_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'Bash']);

// Custom error class so we can distinguish controller-thrown timeout/cancel
// from user-thrown executor errors during retry decisions.
class TimeoutError extends Error {
  readonly kind = 'timeout' as const;
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
class CancelledError extends Error {
  readonly kind = 'cancelled' as const;
  constructor(message = 'cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}

export class ToolController {
  private readonly coordinator: Pick<FileCoordinator, 'acquire'>;
  private readonly seenIds = new Set<string>();
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(private readonly options: ToolControllerOptions) {
    this.coordinator = options.coordinator ?? new FileCoordinator();
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async execute(request: ToolRequest): Promise<ToolExecutionResult> {
    const startedAt = this.now();
    const telemetry: ToolTelemetry = {
      toolName: request.toolName,
      toolCallId: request.id,
      attempts: 0,
      durationMs: 0,
      ok: false,
    };

    // External cancellation short-circuits everything.
    if (this.options.signal?.aborted) {
      return this.fail('cancelled', 'cancelled', startedAt, telemetry, request);
    }

    const descriptor = this.options.registry.lookup(request.toolName);
    if (!descriptor) {
      return this.fail(`Unknown tool: ${request.toolName}`, 'unknown_tool', startedAt, telemetry, request);
    }

    if (this.seenIds.has(request.id)) {
      return this.fail(
        `Duplicate tool call id: ${request.id}`,
        'duplicate_id',
        startedAt,
        telemetry,
        request,
      );
    }
    this.seenIds.add(request.id);

    if (isPlanDenied(request, descriptor, this.options.permissionMode)) {
      return this.fail(
        `Tool denied in plan mode: ${request.toolName}`,
        'plan_denied',
        startedAt,
        telemetry,
        request,
      );
    }

    const permissionFailure = await this.requestPermission(request, startedAt, telemetry);
    if (permissionFailure) return permissionFailure;

    if (descriptor.validate) {
      const verdict = await Promise.resolve(descriptor.validate(request));
      if (verdict !== true) {
        const message = typeof verdict === 'string'
          ? verdict
          : `Invalid input for ${request.toolName}`;
        return this.fail(message, 'validation_failed', startedAt, telemetry, request);
      }
    }

    const release = await this.acquireLock(request, descriptor);

    try {
      // beforeTool runs once per execute, BEFORE the lock-protected loop, so
      // a hook that performs side-effects (logging, audit) doesn't fire per
      // retry attempt.
      const beforeError = await runBeforeHook(this.options.hooks?.beforeTool, request);
      if (beforeError) {
        return this.failError(beforeError, 'executor_error', startedAt, telemetry, request);
      }

      return await this.runWithRetries(descriptor, request, startedAt, telemetry);
    } finally {
      release?.();
    }
  }

  private async runWithRetries(
    descriptor: ToolDescriptor,
    request: ToolRequest,
    startedAt: number,
    telemetry: ToolTelemetry,
  ): Promise<ToolExecutionResult> {
    const events: TurnEvent[] = [{ type: 'tool_started', ...request }];
    const maxRetries = Math.max(0, descriptor.retries ?? 0);
    const backoff = Math.max(0, descriptor.retryBackoffMs ?? 0);
    const timeoutMs = descriptor.timeoutMs ?? this.options.defaultTimeoutMs ?? 0;

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      telemetry.attempts = attempt + 1;
      try {
        const value = await this.runOnce(descriptor, request, timeoutMs);
        const toolResult = { id: request.id, result: value };
        const finalTelemetry = stamp(telemetry, this.now() - startedAt, true);
        await safeAfterHook(this.options.hooks?.afterTool, request, toolResult, finalTelemetry);
        events.push({ type: 'tool_result', ...toolResult });
        return { ok: true, events, toolResult, telemetry: finalTelemetry };
      } catch (err) {
        lastError = toError(err);
        if (lastError instanceof CancelledError || this.options.signal?.aborted) {
          return this.failError(new CancelledError(), 'cancelled', startedAt, telemetry, request, events);
        }
        if (lastError instanceof TimeoutError) {
          // Timeouts ARE retryable: a slow upstream may recover. Bail
          // immediately if no retries remain.
          if (attempt >= maxRetries) {
            return this.failError(lastError, 'timed_out', startedAt, telemetry, request, events);
          }
        }
        if (attempt >= maxRetries) {
          return this.failError(lastError, 'executor_error', startedAt, telemetry, request, events);
        }
        if (backoff > 0) {
          try {
            await this.sleep(backoff * (attempt + 1), this.options.signal);
          } catch {
            return this.failError(new CancelledError(), 'cancelled', startedAt, telemetry, request, events);
          }
        }
      }
    }

    // Unreachable: the loop always returns. Defensive fallback.
    return this.failError(
      lastError ?? new Error('unknown error'),
      'executor_error',
      startedAt,
      telemetry,
      request,
      events,
    );
  }

  private async runOnce(
    descriptor: ToolDescriptor,
    request: ToolRequest,
    timeoutMs: number,
  ): Promise<unknown> {
    const controller = new AbortController();
    const onParentAbort = () => controller.abort(new CancelledError());
    if (this.options.signal) {
      if (this.options.signal.aborted) {
        controller.abort(new CancelledError());
      } else {
        this.options.signal.addEventListener('abort', onParentAbort, { once: true });
      }
    }

    let timeoutId: NodeJS.Timeout | undefined;
    let timedOut = false;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort(new TimeoutError(`Tool ${request.toolName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    // Race the executor against the abort signal. This is what guarantees
    // the call returns even when the executor ignores its `ctx.signal` —
    // a misbehaving descriptor can still keep computing in the background,
    // but the controller resolves and the turn is no longer blocked.
    const abortPromise = new Promise<never>((_, reject) => {
      if (controller.signal.aborted) {
        reject(timedOut ? new TimeoutError(`Tool ${request.toolName} timed out after ${timeoutMs}ms`) : new CancelledError());
        return;
      }
      controller.signal.addEventListener(
        'abort',
        () => {
          reject(timedOut ? new TimeoutError(`Tool ${request.toolName} timed out after ${timeoutMs}ms`) : new CancelledError());
        },
        { once: true },
      );
    });

    try {
      const value = await Promise.race([
        Promise.resolve(descriptor.execute(request, { signal: controller.signal })),
        abortPromise,
      ]);
      return value;
    } catch (err) {
      // Map AbortError-like exceptions to our typed errors.
      if (timedOut || err instanceof TimeoutError) {
        throw new TimeoutError(`Tool ${request.toolName} timed out after ${timeoutMs}ms`);
      }
      if (err instanceof CancelledError || controller.signal.aborted) {
        throw new CancelledError();
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (this.options.signal) {
        this.options.signal.removeEventListener('abort', onParentAbort);
      }
    }
  }

  private async requestPermission(
    request: ToolRequest,
    startedAt: number,
    telemetry: ToolTelemetry,
  ): Promise<ToolExecutionResult | null> {
    if (this.options.permissionMode !== 'autoAccept' || !this.options.permissionRequester) {
      return null;
    }
    const permissionEvent: TurnEvent = {
      type: 'permission_requested',
      requestId: `perm-${request.id}`,
      toolCallId: request.id,
      message: `Allow ${request.toolName}?`,
    };
    const decision = await Promise.resolve(this.options.permissionRequester(request));
    if (decision.decision === 'allow') return null;
    const suffix = decision.message ? `: ${decision.message}` : '';
    const message = `Permission denied for ${request.toolName}${suffix}`;
    const finalTelemetry = stamp(telemetry, this.now() - startedAt, false, 'permission_denied');
    await safeErrorHook(this.options.hooks?.onError, request, new Error(message), finalTelemetry);
    return {
      ok: false,
      events: [permissionEvent, { type: 'error', message }],
      telemetry: finalTelemetry,
    };
  }

  private async acquireLock(
    request: ToolRequest,
    descriptor: ToolDescriptor,
  ): Promise<Release | undefined> {
    const lock = resolveLock(request, descriptor.lock);
    if (!lock) return undefined;
    if (typeof lock === 'string') return this.coordinator.acquire(lock, 'write');
    return this.coordinator.acquire(lock.key, lock.mode ?? 'write');
  }

  private fail(
    message: string,
    reason: ToolTelemetry['reason'],
    startedAt: number,
    telemetry: ToolTelemetry,
    request: ToolRequest,
  ): ToolExecutionResult {
    const finalTelemetry = stamp(telemetry, this.now() - startedAt, false, reason);
    void safeErrorHook(this.options.hooks?.onError, request, new Error(message), finalTelemetry);
    return {
      ok: false,
      events: [{ type: 'error', message }],
      telemetry: finalTelemetry,
    };
  }

  private failError(
    error: Error,
    reason: ToolTelemetry['reason'],
    startedAt: number,
    telemetry: ToolTelemetry,
    request: ToolRequest,
    events: TurnEvent[] = [],
  ): ToolExecutionResult {
    const finalTelemetry = stamp(telemetry, this.now() - startedAt, false, reason);
    void safeErrorHook(this.options.hooks?.onError, request, error, finalTelemetry);
    return {
      ok: false,
      events: [...events, { type: 'error', message: error.message }],
      telemetry: finalTelemetry,
    };
  }
}

function isPlanDenied(
  request: ToolRequest,
  descriptor: ToolDescriptor,
  mode: PermissionMode | undefined,
): boolean {
  if (mode !== 'plan') return false;
  return descriptor.mutates ?? PLAN_DENIED_TOOLS.has(request.toolName);
}

function resolveLock(request: ToolRequest, lock: ToolDescriptor['lock']): ToolLock {
  return typeof lock === 'function' ? lock(request) : lock;
}

function stamp(
  telemetry: ToolTelemetry,
  durationMs: number,
  ok: boolean,
  reason?: ToolTelemetry['reason'],
): ToolTelemetry {
  return { ...telemetry, durationMs, ok, ...(reason ? { reason } : {}) };
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : JSON.stringify(value));
}

async function runBeforeHook(
  hook: BeforeHook | undefined,
  request: ToolRequest,
): Promise<Error | null> {
  if (!hook) return null;
  try {
    await hook(request);
    return null;
  } catch (err) {
    return toError(err);
  }
}

async function safeAfterHook(
  hook: AfterHook | undefined,
  request: ToolRequest,
  result: ToolResult,
  telemetry: ToolTelemetry,
): Promise<void> {
  if (!hook) return;
  try {
    await hook(request, result, telemetry);
  } catch {
    // Hooks must not affect the result. If they throw, swallow.
  }
}

async function safeErrorHook(
  hook: ErrorHook | undefined,
  request: ToolRequest,
  error: Error,
  telemetry: ToolTelemetry,
): Promise<void> {
  if (!hook) return;
  try {
    await hook(request, error, telemetry);
  } catch {
    // Same swallow rule as afterTool.
  }
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }
    const id = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(id);
      reject(new CancelledError());
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

// Suppress unused warning — re-exported for downstream callers that
// want to type-check their own coordinator implementations against
// the same Mode the controller expects.
export type { Mode };
