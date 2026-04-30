import type { PermissionRequest, ToolRequest, ToolResult, TurnEvent, TurnPhase } from './events.js';

export interface TurnState {
  phase: TurnPhase;
  pendingToolRequest?: ToolRequest;
  permissionRequest?: PermissionRequest;
  runningTool?: ToolRequest;
  toolResults: ToolResult[];
  assistantText?: string;
  error?: string;
}

export const initialTurnState: TurnState = { phase: 'idle', toolResults: [] };

export function applyTurnEvent(state: TurnState, event: TurnEvent): TurnState {
  switch (event.type) {
    case 'user_message':
    case 'model_started':
      return { ...state, phase: 'composing' };
    case 'model_tool_request': {
      const request = { id: event.id, toolName: event.toolName, input: event.input };
      return {
        ...state,
        phase: 'tool_requested',
        pendingToolRequest: request,
        runningTool: undefined,
      };
    }
    case 'permission_requested':
      return {
        ...state,
        phase: 'permission_pending',
        permissionRequest: { requestId: event.requestId, toolCallId: event.toolCallId, message: event.message },
      };
    case 'tool_started': {
      const request = { id: event.id, toolName: event.toolName, input: event.input };
      return {
        ...state,
        phase: 'tool_running',
        pendingToolRequest: undefined,
        permissionRequest: undefined,
        runningTool: request,
      };
    }
    case 'tool_result':
      return {
        ...state,
        phase: 'observing',
        runningTool: undefined,
        toolResults: [...state.toolResults, { id: event.id, result: event.result }],
      };
    case 'assistant_final':
      return { ...state, phase: 'assistant_final', assistantText: event.text };
    case 'cancelled':
      return { ...state, phase: 'cancelled' };
    case 'error':
      return { ...state, phase: 'failed', error: event.message };
  }
}
