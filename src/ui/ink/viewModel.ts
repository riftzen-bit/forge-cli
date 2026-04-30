import type { ToolRequest } from '../../runtime/events.js';
import type { TurnState } from '../../runtime/turnState.js';

export interface TurnViewModel {
  status: string;
  rows: string[];
}

export function buildTurnViewModel(snapshot: TurnState): TurnViewModel {
  switch (snapshot.phase) {
    case 'idle':
      return { status: 'Ready', rows: ['Ready for input'] };
    case 'composing':
      return { status: 'Composing', rows: ['Assistant is composing'] };
    case 'tool_requested':
      return {
        status: 'Tool requested',
        rows: [`Pending tool: ${toolName(snapshot.pendingToolRequest)}`],
      };
    case 'permission_pending':
      return {
        status: 'Permission needed',
        rows: [snapshot.permissionRequest?.message ?? 'Permission needed'],
      };
    case 'tool_running':
      return {
        status: 'Running tool',
        rows: [`Running tool: ${toolName(snapshot.runningTool)}`],
      };
    case 'observing':
      return {
        status: 'Observing',
        rows: [`Observed ${snapshot.toolResults.length} tool result${snapshot.toolResults.length === 1 ? '' : 's'}`],
      };
    case 'assistant_final':
      return {
        status: 'Assistant final',
        rows: [snapshot.assistantText ?? 'Assistant finished'],
      };
    case 'cancelled':
      return { status: 'Cancelled', rows: ['Turn cancelled'] };
    case 'failed':
      return { status: 'Failed', rows: [snapshot.error ?? 'Turn failed'] };
  }
}

function toolName(request: ToolRequest | undefined): string {
  return request?.toolName ?? 'unknown';
}
