import { describe, expect, test } from 'bun:test';
import { runRuntimeTurn } from './bootstrap.js';

describe('runtime bootstrap', () => {
  test('composes the runtime for assistant final text', async () => {
    const result = await runRuntimeTurn({
      prompt: 'Say done',
      modelEvents: [
        { type: 'model_started' },
        { type: 'assistant_final', text: 'Done.' },
      ],
    });

    expect(result.state.phase).toBe('assistant_final');
    expect(result.state.assistantText).toBe('Done.');
    expect(result.pendingToolRequest).toBeUndefined();
  });

  test('surfaces pending tools without executing them', async () => {
    const toolRequest = { id: 'tool-1', toolName: 'Read', input: { file_path: 'README.md' } };

    const result = await runRuntimeTurn({
      prompt: 'Read the file',
      modelEvents: [
        { type: 'model_started' },
        { type: 'model_tool_request', ...toolRequest },
        { type: 'assistant_final', text: 'ignored' },
      ],
    });

    expect(result.state.phase).toBe('tool_requested');
    expect(result.pendingToolRequest).toEqual(toolRequest);
  });
});
