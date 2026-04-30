import { describe, expect, test } from 'bun:test';
import { formatToolSummary, sanitizeToolOutput, shouldShowOkPreview } from './toolFormat.js';

describe('sanitizeToolOutput', () => {
  test('strips wrapping <tool_use_error> tags', () => {
    const wrapped = '<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>';
    expect(sanitizeToolOutput(wrapped)).toBe('File has not been read yet. Read it first before writing to it.');
  });

  test('strips bare interior tags', () => {
    expect(sanitizeToolOutput('boom <tool_use_error>boom</tool_use_error> tail')).toBe('boom boom tail');
  });

  test('passes plain text through unchanged', () => {
    expect(sanitizeToolOutput('hello world')).toBe('hello world');
  });

  test('handles empty string', () => {
    expect(sanitizeToolOutput('')).toBe('');
  });

  test('trims surrounding whitespace inside the wrapper', () => {
    expect(sanitizeToolOutput('  <tool_use_error>\n  inner\n</tool_use_error>  ')).toBe('inner');
  });
});

describe('shouldShowOkPreview', () => {
  test('hides for path-tools whose stats already convey what happened', () => {
    expect(shouldShowOkPreview('Read')).toBe(false);
    expect(shouldShowOkPreview('Edit')).toBe(false);
    expect(shouldShowOkPreview('Write')).toBe(false);
    expect(shouldShowOkPreview('TodoWrite')).toBe(false);
  });

  test('shows for tools whose output IS the artifact', () => {
    expect(shouldShowOkPreview('Bash')).toBe(true);
    expect(shouldShowOkPreview('Grep')).toBe(true);
    expect(shouldShowOkPreview('Glob')).toBe(true);
    expect(shouldShowOkPreview('WebFetch')).toBe(true);
  });

  test('strips MCP and tag prefixes before lookup', () => {
    expect(shouldShowOkPreview('[sub1] Read')).toBe(false);
    expect(shouldShowOkPreview('mcp__forge-spawn__spawn_agent')).toBe(false);
  });
});

describe('formatToolSummary', () => {
  test('combines display name and compact args', () => {
    expect(formatToolSummary('Read', { file_path: 'D:/Projects/cli/src/app.tsx' }, 'D:/Projects/cli')).toBe('Read src/app.tsx');
  });

  test('keeps command tools readable', () => {
    expect(formatToolSummary('Bash', { command: 'bun test src/runtime/turnState.test.ts' }, 'D:/Projects/cli')).toBe('Bash bun test src/runtime/turnState.test.ts');
  });
});
