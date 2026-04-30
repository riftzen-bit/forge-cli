import { describe, expect, mock, test } from 'bun:test';
import type { ToolRequest } from '../events.js';
import { ToolController } from './toolController.js';
import { ToolRegistry } from './toolRegistry.js';

function request(toolName: string, input: Record<string, unknown> = {}, id?: string): ToolRequest {
  return { id: id ?? `${toolName}-1`, toolName, input };
}

describe('ToolController — basics', () => {
  test('unknown tools fail without calling an executor', async () => {
    const registry = new ToolRegistry();
    const controller = new ToolController({ registry });

    const result = await controller.execute(request('MissingTool'));

    expect(result.ok).toBe(false);
    expect(result.events).toEqual([{ type: 'error', message: 'Unknown tool: MissingTool' }]);
    expect(result.telemetry.reason).toBe('unknown_tool');
    expect(result.telemetry.attempts).toBe(0);
  });

  test('plan mode denies mutating tools without calling the executor', async () => {
    const execute = mock(async () => 'changed');
    const registry = new ToolRegistry([{ name: 'Write', execute }]);
    const controller = new ToolController({ registry, permissionMode: 'plan' });

    const result = await controller.execute(request('Write', { file_path: 'notes.txt' }));

    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(result.events).toEqual([
      { type: 'error', message: 'Tool denied in plan mode: Write' },
    ]);
    expect(result.telemetry.reason).toBe('plan_denied');
  });

  test('default mode starts allowed tools and returns tool result data', async () => {
    const execute = mock(async () => ({ content: 'hello' }));
    const registry = new ToolRegistry([
      { name: 'Read', mutates: false, execute },
    ]);
    const controller = new ToolController({ registry, permissionMode: 'default' });
    const toolRequest = request('Read', { file_path: 'README.md' });

    const result = await controller.execute(toolRequest);

    expect(result.ok).toBe(true);
    expect(execute).toHaveBeenCalled();
    expect(result.toolResult).toEqual({ id: 'Read-1', result: { content: 'hello' } });
    expect(result.events).toEqual([
      { type: 'tool_started', ...toolRequest },
      { type: 'tool_result', id: 'Read-1', result: { content: 'hello' } },
    ]);
    expect(result.telemetry.ok).toBe(true);
    expect(result.telemetry.attempts).toBe(1);
  });

  test('default mode ignores a denying permission requester', async () => {
    const execute = mock(async () => ({ content: 'hello' }));
    const registry = new ToolRegistry([
      { name: 'Read', mutates: false, execute },
    ]);
    const permissionRequester = mock(async () => ({ decision: 'deny' as const, message: 'blocked' }));
    const controller = new ToolController({ registry, permissionMode: 'default', permissionRequester });
    const toolRequest = request('Read', { file_path: 'README.md' });

    const result = await controller.execute(toolRequest);

    expect(result.ok).toBe(true);
    expect(permissionRequester).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalled();
  });

  test('permission requester denial records the request and does not run the executor', async () => {
    const execute = mock(async () => 'changed');
    const registry = new ToolRegistry([{ name: 'Bash', execute }]);
    const controller = new ToolController({
      registry,
      permissionMode: 'autoAccept',
      permissionRequester: mock(async () => ({ decision: 'deny', message: 'No shell today' })),
    });

    const result = await controller.execute(request('Bash', { command: 'rm -rf dist' }));

    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(result.events).toEqual([
      {
        type: 'permission_requested',
        requestId: 'perm-Bash-1',
        toolCallId: 'Bash-1',
        message: 'Allow Bash?',
      },
      { type: 'error', message: 'Permission denied for Bash: No shell today' },
    ]);
    expect(result.telemetry.reason).toBe('permission_denied');
  });

  test('locks serialize executions with the same lock key', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const registry = new ToolRegistry([
      {
        name: 'Edit',
        lock: () => ({ key: 'file:/tmp/a.txt', mode: 'write' }),
        async execute(toolRequest) {
          order.push(`start:${toolRequest.id}`);
          if (toolRequest.id === 'first') await firstCanFinish;
          order.push(`end:${toolRequest.id}`);
          return toolRequest.id;
        },
      },
    ]);
    const controller = new ToolController({ registry });

    const first = controller.execute({ id: 'first', toolName: 'Edit', input: {} });
    const second = controller.execute({ id: 'second', toolName: 'Edit', input: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order).toEqual(['start:first']);
    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['start:first', 'end:first', 'start:second', 'end:second']);
  });

  test('hooks run before and after the executor', async () => {
    const order: string[] = [];
    const registry = new ToolRegistry([
      {
        name: 'Read',
        mutates: false,
        async execute() {
          order.push('execute');
          return 'ok';
        },
      },
    ]);
    const controller = new ToolController({
      registry,
      hooks: {
        beforeTool: async () => {
          order.push('before');
        },
        afterTool: async () => {
          order.push('after');
        },
      },
    });

    await controller.execute(request('Read'));

    expect(order).toEqual(['before', 'execute', 'after']);
  });
});

describe('ToolController — duplicate id detection', () => {
  test('rejects a re-used tool call id', async () => {
    const execute = mock(async () => 'first');
    const registry = new ToolRegistry([{ name: 'Read', mutates: false, execute }]);
    const controller = new ToolController({ registry });

    const first = await controller.execute(request('Read', {}, 'dup-1'));
    expect(first.ok).toBe(true);

    const second = await controller.execute(request('Read', {}, 'dup-1'));
    expect(second.ok).toBe(false);
    expect(second.telemetry.reason).toBe('duplicate_id');
    expect(second.events[0]).toMatchObject({
      type: 'error',
      message: 'Duplicate tool call id: dup-1',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe('ToolController — input validation', () => {
  test('rejected validation skips the executor and emits the validator message', async () => {
    const execute = mock(async () => 'never');
    const registry = new ToolRegistry([
      {
        name: 'Bash',
        execute,
        validate: () => 'empty command',
      },
    ]);
    const controller = new ToolController({ registry });

    const result = await controller.execute(request('Bash', { command: '' }));

    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(result.telemetry.reason).toBe('validation_failed');
    expect(result.events).toEqual([{ type: 'error', message: 'empty command' }]);
  });

  test('boolean false validator emits a default message', async () => {
    const registry = new ToolRegistry([
      {
        name: 'Bash',
        execute: async () => 'never',
        validate: () => false,
      },
    ]);
    const controller = new ToolController({ registry });

    const result = await controller.execute(request('Bash', { command: '' }));

    expect(result.ok).toBe(false);
    expect(result.events).toEqual([{ type: 'error', message: 'Invalid input for Bash' }]);
  });

  test('async validator that resolves to true allows execution', async () => {
    const execute = mock(async () => 'ok');
    const registry = new ToolRegistry([
      {
        name: 'Read',
        mutates: false,
        execute,
        validate: async () => true,
      },
    ]);
    const controller = new ToolController({ registry });

    const result = await controller.execute(request('Read'));

    expect(result.ok).toBe(true);
    expect(execute).toHaveBeenCalled();
  });
});

describe('ToolController — timeout', () => {
  test('timeout aborts the executor signal and fails the call', async () => {
    let received: AbortSignal | undefined;
    const registry = new ToolRegistry([
      {
        name: 'Slow',
        timeoutMs: 5,
        execute: (_req, ctx) => {
          received = ctx.signal;
          return new Promise((resolve, reject) => {
            ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason));
            setTimeout(() => resolve('done'), 100);
          });
        },
      },
    ]);
    const controller = new ToolController({ registry });

    const result = await controller.execute(request('Slow'));

    expect(result.ok).toBe(false);
    expect(result.telemetry.reason).toBe('timed_out');
    expect(received?.aborted).toBe(true);
    expect(result.events.at(-1)).toMatchObject({
      type: 'error',
      message: 'Tool Slow timed out after 5ms',
    });
  });

  test('default timeout applies when descriptor does not set its own', async () => {
    const registry = new ToolRegistry([
      {
        name: 'Slow',
        execute: () => new Promise((resolve) => setTimeout(() => resolve('done'), 100)),
      },
    ]);
    const controller = new ToolController({ registry, defaultTimeoutMs: 5 });

    const result = await controller.execute(request('Slow'));

    expect(result.ok).toBe(false);
    expect(result.telemetry.reason).toBe('timed_out');
  });
});

describe('ToolController — retries', () => {
  test('flaky executor succeeds on a later retry', async () => {
    let attempts = 0;
    const registry = new ToolRegistry([
      {
        name: 'Flaky',
        retries: 2,
        retryBackoffMs: 0,
        async execute() {
          attempts++;
          if (attempts < 2) throw new Error('boom');
          return 'ok';
        },
      },
    ]);
    const controller = new ToolController({ registry });

    const result = await controller.execute(request('Flaky'));

    expect(result.ok).toBe(true);
    expect(result.telemetry.attempts).toBe(2);
    expect(attempts).toBe(2);
  });

  test('all retries exhaust before giving up', async () => {
    let attempts = 0;
    const registry = new ToolRegistry([
      {
        name: 'Doomed',
        retries: 2,
        retryBackoffMs: 0,
        async execute() {
          attempts++;
          throw new Error('always');
        },
      },
    ]);
    const controller = new ToolController({ registry });

    const result = await controller.execute(request('Doomed'));

    expect(result.ok).toBe(false);
    expect(result.telemetry.attempts).toBe(3);
    expect(attempts).toBe(3);
    expect(result.events.at(-1)).toEqual({ type: 'error', message: 'always' });
  });

  test('retry backoff delegates to the injected sleep with growing delay', async () => {
    const sleeps: number[] = [];
    const registry = new ToolRegistry([
      {
        name: 'Doomed',
        retries: 2,
        retryBackoffMs: 10,
        async execute() {
          throw new Error('again');
        },
      },
    ]);
    const controller = new ToolController({
      registry,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    const result = await controller.execute(request('Doomed'));

    expect(result.ok).toBe(false);
    expect(sleeps).toEqual([10, 20]);
  });

  test('cancellation skips remaining retries', async () => {
    let attempts = 0;
    const ac = new AbortController();
    const registry = new ToolRegistry([
      {
        name: 'Slow',
        retries: 5,
        retryBackoffMs: 0,
        async execute(_req, ctx) {
          attempts++;
          ac.abort();
          throw ctx.signal.aborted ? new Error('cancelled') : new Error('boom');
        },
      },
    ]);
    const controller = new ToolController({ registry, signal: ac.signal });

    const result = await controller.execute(request('Slow'));

    expect(result.ok).toBe(false);
    expect(result.telemetry.reason).toBe('cancelled');
    expect(attempts).toBe(1);
  });
});

describe('ToolController — cancellation', () => {
  test('pre-aborted signal short-circuits before lookup', async () => {
    const execute = mock(async () => 'never');
    const registry = new ToolRegistry([{ name: 'Read', mutates: false, execute }]);
    const ac = new AbortController();
    ac.abort();
    const controller = new ToolController({ registry, signal: ac.signal });

    const result = await controller.execute(request('Read'));

    expect(result.ok).toBe(false);
    expect(result.telemetry.reason).toBe('cancelled');
    expect(execute).not.toHaveBeenCalled();
  });

  test('mid-execution abort propagates to the executor signal', async () => {
    const ac = new AbortController();
    const registry = new ToolRegistry([
      {
        name: 'Slow',
        execute: (_req, ctx) =>
          new Promise((resolve, reject) => {
            ctx.signal.addEventListener('abort', () => reject(new Error('aborted')));
            setTimeout(() => resolve('late'), 100);
          }),
      },
    ]);
    const controller = new ToolController({ registry, signal: ac.signal });

    const promise = controller.execute(request('Slow'));
    setTimeout(() => ac.abort(), 5);
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.telemetry.reason).toBe('cancelled');
  });
});

describe('ToolController — telemetry & onError hook', () => {
  test('successful execution reports duration and attempts in telemetry', async () => {
    let now = 1_000;
    const registry = new ToolRegistry([
      {
        name: 'Read',
        mutates: false,
        async execute() {
          now += 50;
          return 'hi';
        },
      },
    ]);
    const controller = new ToolController({ registry, now: () => now });

    const result = await controller.execute(request('Read'));

    expect(result.ok).toBe(true);
    expect(result.telemetry.durationMs).toBe(50);
    expect(result.telemetry.toolName).toBe('Read');
    expect(result.telemetry.toolCallId).toBe('Read-1');
  });

  test('onError hook fires with classified telemetry on validator failure', async () => {
    const onError = mock(async () => undefined);
    const registry = new ToolRegistry([
      {
        name: 'Bash',
        execute: async () => 'never',
        validate: () => 'nope',
      },
    ]);
    const controller = new ToolController({ registry, hooks: { onError } });

    await controller.execute(request('Bash'));

    expect(onError).toHaveBeenCalledTimes(1);
    const callArg = (onError.mock.calls[0] ?? []) as unknown[];
    expect(callArg[1]).toBeInstanceOf(Error);
    const telemetry = callArg[2] as { reason?: string };
    expect(telemetry.reason).toBe('validation_failed');
  });

  test('after hook receives telemetry alongside the result', async () => {
    let captured: { ok: boolean; attempts: number } | undefined;
    const registry = new ToolRegistry([
      {
        name: 'Read',
        mutates: false,
        async execute() {
          return 'ok';
        },
      },
    ]);
    const controller = new ToolController({
      registry,
      hooks: {
        afterTool: async (_req, _result, telemetry) => {
          captured = { ok: telemetry.ok, attempts: telemetry.attempts };
        },
      },
    });

    await controller.execute(request('Read'));

    expect(captured).toEqual({ ok: true, attempts: 1 });
  });

  test('throwing afterTool hook does not break a successful execution', async () => {
    const registry = new ToolRegistry([
      {
        name: 'Read',
        mutates: false,
        async execute() {
          return 'ok';
        },
      },
    ]);
    const controller = new ToolController({
      registry,
      hooks: {
        afterTool: async () => {
          throw new Error('hook bug');
        },
      },
    });

    const result = await controller.execute(request('Read'));

    expect(result.ok).toBe(true);
    expect(result.toolResult?.result).toBe('ok');
  });

  test('throwing beforeTool hook fails the call before executor runs', async () => {
    const execute = mock(async () => 'never');
    const registry = new ToolRegistry([
      { name: 'Read', mutates: false, execute },
    ]);
    const controller = new ToolController({
      registry,
      hooks: {
        beforeTool: async () => {
          throw new Error('blocked');
        },
      },
    });

    const result = await controller.execute(request('Read'));

    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(result.events.at(-1)).toEqual({ type: 'error', message: 'blocked' });
  });
});

describe('ToolRegistry — introspection', () => {
  test('size and list reflect registered tools', () => {
    const registry = new ToolRegistry([
      { name: 'Read', execute: async () => 'a' },
      { name: 'Write', execute: async () => 'b' },
    ]);

    expect(registry.size()).toBe(2);
    expect(registry.list().map((d) => d.name).sort()).toEqual(['Read', 'Write']);
  });
});
