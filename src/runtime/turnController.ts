import type { ModelAdapter, ToolRequest, TurnEvent } from './events.js';
import { applyTurnEvent, initialTurnState, type TurnState } from './turnState.js';

export interface RunUserTurnInput {
  prompt: string;
  signal?: AbortSignal;
}

export interface TurnControllerResult {
  state: TurnState;
  pendingToolRequest?: ToolRequest;
}

export interface TurnControllerOptions {
  model: ModelAdapter;
}

export class TurnController {
  private readonly model: ModelAdapter;

  constructor(options: TurnControllerOptions) {
    this.model = options.model;
  }

  async runUserTurn(input: RunUserTurnInput): Promise<TurnControllerResult> {
    let state = applyTurnEvent(initialTurnState, { type: 'user_message', text: input.prompt });

    if (input.signal?.aborted) {
      state = applyTurnEvent(state, { type: 'cancelled' });
      return snapshot(state);
    }

    const iterator = this.model.sendTurn({ prompt: input.prompt })[Symbol.asyncIterator]();

    try {
      while (true) {
        const next = await nextModelEvent(iterator, input.signal);

        if (next === 'cancelled') {
          discardIterator(iterator);
          state = applyTurnEvent(state, { type: 'cancelled' });
          return snapshot(state);
        }

        if (next.done) break;

        const event = next.value;
        state = applyTurnEvent(state, event);

        if (state.phase === 'tool_requested') {
          return snapshot(state);
        }

        if (input.signal?.aborted) {
          state = applyTurnEvent(state, { type: 'cancelled' });
          return snapshot(state);
        }
      }
    } catch (error) {
      if (input.signal?.aborted) {
        state = applyTurnEvent(state, { type: 'cancelled' });
      } else {
        state = applyTurnEvent(state, {
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return snapshot(state);
  }
}

function snapshot(state: TurnState): TurnControllerResult {
  return {
    state,
    pendingToolRequest: state.pendingToolRequest,
  };
}

function nextModelEvent(
  iterator: AsyncIterator<TurnEvent>,
  signal?: AbortSignal,
): Promise<IteratorResult<TurnEvent> | 'cancelled'> {
  if (!signal) return iterator.next();
  if (signal.aborted) return Promise.resolve('cancelled');

  return new Promise((resolve, reject) => {
    const onAbort = () => resolve('cancelled');
    signal.addEventListener('abort', onAbort, { once: true });

    iterator.next().then(
      (next) => {
        signal.removeEventListener('abort', onAbort);
        resolve(next);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function discardIterator(iterator: AsyncIterator<TurnEvent>): void {
  const stop = iterator.return?.();
  if (stop) void stop.catch(() => {
    // Closing a discarded stream can reject after cancellation; no caller can act on that cleanup noise.
  });
}
