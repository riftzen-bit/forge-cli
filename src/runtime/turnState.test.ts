import { describe, expect, test } from 'bun:test';
import { applyTurnEvent, initialTurnState } from './turnState.js';

describe('applyTurnEvent', () => {
  test('model tool requests wait for permission instead of running immediately', () => {
    const request = { id: 'tool-1', toolName: 'Read', input: { file_path: 'README.md' } };
    const state = applyTurnEvent(initialTurnState, {
      type: 'model_tool_request',
      ...request,
    });

    expect(state.phase).toBe('tool_requested');
    expect(state.pendingToolRequest).toEqual(request);
    expect(state.runningTool).toBeUndefined();
  });

  test('permission request moves a pending tool into permission pending', () => {
    const requested = applyTurnEvent(initialTurnState, {
      type: 'model_tool_request',
      id: 'tool-1',
      toolName: 'Bash',
      input: { command: 'pwd' },
    });

    const state = applyTurnEvent(requested, {
      type: 'permission_requested',
      requestId: 'perm-1',
      toolCallId: 'tool-1',
      message: 'Allow Bash?',
    });

    expect(state.phase).toBe('permission_pending');
    expect(state.permissionRequest).toEqual({ requestId: 'perm-1', toolCallId: 'tool-1', message: 'Allow Bash?' });
    expect(state.runningTool).toBeUndefined();
  });

  test('tool start and result move through running then observing', () => {
    const running = applyTurnEvent(initialTurnState, {
      type: 'tool_started',
      id: 'tool-1', toolName: 'Read', input: { file_path: 'README.md' },
    });

    expect(running.phase).toBe('tool_running');
    expect(running.runningTool?.id).toBe('tool-1');

    const observed = applyTurnEvent(running, {
      type: 'tool_result',
      id: 'tool-1',
      result: { content: 'hello' },
    });

    expect(observed.phase).toBe('observing');
    expect(observed.runningTool).toBeUndefined();
    expect(observed.toolResults).toEqual([{ id: 'tool-1', result: { content: 'hello' } }]);
  });

  test('assistant final, cancellation, and errors end the turn', () => {
    const final = applyTurnEvent(initialTurnState, {
      type: 'assistant_final',
      text: 'Done.',
    });
    expect(final.phase).toBe('assistant_final');
    expect(final.assistantText).toBe('Done.');

    expect(applyTurnEvent(initialTurnState, { type: 'cancelled' }).phase).toBe('cancelled');

    const failed = applyTurnEvent(initialTurnState, {
      type: 'error',
      message: 'model failed',
    });
    expect(failed.phase).toBe('failed');
    expect(failed.error).toBe('model failed');
  });
});
