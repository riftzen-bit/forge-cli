export type TurnPhase =
  | 'idle' | 'composing' | 'tool_requested' | 'permission_pending'
  | 'tool_running' | 'observing' | 'assistant_final' | 'cancelled' | 'failed';

export interface ToolRequest {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface PermissionRequest {
  requestId: string;
  toolCallId: string;
  message?: string;
}

export interface ToolResult {
  id: string;
  result: unknown;
}

export type TurnEvent =
  | { type: 'user_message'; text: string }
  | { type: 'model_started' }
  | ({ type: 'model_tool_request' } & ToolRequest)
  | ({ type: 'permission_requested' } & PermissionRequest)
  | ({ type: 'tool_started' } & ToolRequest)
  | ({ type: 'tool_result' } & ToolResult)
  | { type: 'assistant_final'; text: string }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

export interface ModelAdapter {
  sendTurn(input: { prompt: string }): AsyncIterable<TurnEvent>;
}

export interface ToolAdapter {
  run(request: ToolRequest): Promise<ToolResult>;
}
