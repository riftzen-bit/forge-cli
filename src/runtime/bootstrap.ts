import type { ModelAdapter, ToolRequest, TurnEvent } from './events.js';
import type { TurnState } from './turnState.js';
import { TurnController } from './turnController.js';

export interface RunRuntimeTurnInput {
  prompt: string;
  modelEvents?: TurnEvent[];
}

export interface RuntimeTurnResult {
  state: TurnState;
  pendingToolRequest?: ToolRequest;
}

export async function runRuntimeTurn(input: RunRuntimeTurnInput): Promise<RuntimeTurnResult> {
  const controller = new TurnController({
    model: modelFrom(input.modelEvents ?? defaultSmokeEvents()),
  });
  const result = await controller.runUserTurn({ prompt: input.prompt });

  return {
    state: result.state,
    pendingToolRequest: result.pendingToolRequest,
  };
}

function defaultSmokeEvents(): TurnEvent[] {
  return [
    { type: 'model_started' },
    { type: 'assistant_final', text: 'Runtime smoke path is wired.' },
  ];
}

export function pendingToolSmokeEvents(): TurnEvent[] {
  return [
    { type: 'model_started' },
    { type: 'model_tool_request', id: 'smoke-tool-1', toolName: 'Noop', input: {} },
  ];
}

function modelFrom(events: TurnEvent[]): ModelAdapter {
  return {
    async *sendTurn() {
      for (const event of events) yield event;
    },
  };
}
