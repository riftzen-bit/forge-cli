import { describe, expect, test } from 'bun:test';
import type { ModelAdapter, TurnEvent } from './events.js';
import { TurnController } from './turnController.js';

function modelFrom(events: TurnEvent[]): ModelAdapter {
  return {
    async *sendTurn() {
      for (const event of events) yield event;
    },
  };
}

describe('TurnController', () => {
  test('finishes with assistant final text when the model completes without tools', async () => {
    const controller = new TurnController({
      model: modelFrom([
        { type: 'model_started' },
        { type: 'assistant_final', text: 'Done.' },
      ]),
    });

    const result = await controller.runUserTurn({ prompt: 'Say done' });

    expect(result.state.phase).toBe('assistant_final');
    expect(result.state.assistantText).toBe('Done.');
    expect(result.pendingToolRequest).toBeUndefined();
  });

  test('stops on a tool request', async () => {
    const toolRequest = { id: 'tool-1', toolName: 'Read', input: { file_path: 'README.md' } };
    const controller = new TurnController({
      model: modelFrom([
        { type: 'model_started' },
        { type: 'model_tool_request', ...toolRequest },
        { type: 'assistant_final', text: 'ignored' },
      ]),
    });

    const result = await controller.runUserTurn({ prompt: 'Read the file' });

    expect(result.state.phase).toBe('tool_requested');
    expect(result.pendingToolRequest).toEqual(toolRequest);
    expect(result.state.assistantText).toBeUndefined();
  });

  test('maps model stream errors to failed state', async () => {
    const model: ModelAdapter = {
      async *sendTurn() {
        yield { type: 'model_started' };
        throw new Error('model failed');
      },
    };
    const controller = new TurnController({ model });

    const result = await controller.runUserTurn({ prompt: 'Fail' });

    expect(result.state.phase).toBe('failed');
    expect(result.state.error).toBe('model failed');
  });

  test('maps cancellation to cancelled state while waiting for the model', async () => {
    const abort = new AbortController();
    let markWaiting!: () => void;
    const waiting = new Promise<void>((resolve) => { markWaiting = resolve; });
    const model: ModelAdapter = {
      async *sendTurn() {
        yield { type: 'model_started' };
        markWaiting();
        await new Promise(() => {});
      },
    };
    const controller = new TurnController({ model });

    const turn = controller.runUserTurn({ prompt: 'Cancel', signal: abort.signal });
    await waiting;
    abort.abort();

    const result = await Promise.race([
      turn,
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 20)),
    ]);

    expect(result).not.toBe('timed-out');
    if (result === 'timed-out') return;
    expect(result.state.phase).toBe('cancelled');
    expect(result.state.assistantText).toBeUndefined();
  });
});
