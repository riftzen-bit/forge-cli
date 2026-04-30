import { describe, expect, test } from 'bun:test';
import type { TurnState } from '../../runtime/turnState.js';
import { buildTurnViewModel } from './viewModel.js';

describe('buildTurnViewModel', () => {
  test('maps each turn phase to a distinct visible status label', () => {
    const phases: TurnState[] = [
      { phase: 'idle', toolResults: [] },
      { phase: 'composing', toolResults: [] },
      { phase: 'tool_requested', toolResults: [], pendingToolRequest: tool('read-1', 'Read') },
      { phase: 'permission_pending', toolResults: [], permissionRequest: { requestId: 'perm-1', toolCallId: 'read-1', message: 'Allow Read?' } },
      { phase: 'tool_running', toolResults: [], runningTool: tool('bash-1', 'Bash') },
      { phase: 'observing', toolResults: [{ id: 'bash-1', result: 'ok' }] },
      { phase: 'assistant_final', toolResults: [], assistantText: 'All done.' },
      { phase: 'cancelled', toolResults: [] },
      { phase: 'failed', toolResults: [], error: 'model failed' },
    ];

    const labels = phases.map((state) => buildTurnViewModel(state).status);

    expect(labels).toEqual([
      'Ready',
      'Composing',
      'Tool requested',
      'Permission needed',
      'Running tool',
      'Observing',
      'Assistant final',
      'Cancelled',
      'Failed',
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('keeps requested tools pending until they start running', () => {
    const view = buildTurnViewModel({
      phase: 'tool_requested',
      toolResults: [],
      pendingToolRequest: tool('read-1', 'Read'),
    });

    expect(view.rows).toContain('Pending tool: Read');
    expect(view.rows.join('\n')).not.toContain('Running tool: Read');
  });

  test('shows the running tool name when a tool is active', () => {
    const view = buildTurnViewModel({
      phase: 'tool_running',
      toolResults: [],
      runningTool: tool('bash-1', 'Bash'),
    });

    expect(view.rows).toContain('Running tool: Bash');
  });

  test('includes final assistant text', () => {
    const view = buildTurnViewModel({
      phase: 'assistant_final',
      toolResults: [],
      assistantText: 'Here is the answer.',
    });

    expect(view.rows).toContain('Here is the answer.');
  });

  test('includes failed turn error messages', () => {
    const view = buildTurnViewModel({
      phase: 'failed',
      toolResults: [],
      error: 'network unavailable',
    });

    expect(view.rows).toContain('network unavailable');
  });
});

function tool(id: string, toolName: string) {
  return { id, toolName, input: {} };
}
