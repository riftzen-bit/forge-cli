import { describe, expect, test } from 'bun:test';
import { matchRule } from './permissions.js';

describe('matchRule', () => {
  test('no rules yields no decision', () => {
    expect(matchRule([], 'Read', { file_path: 'x' })).toBeNull();
  });

  test('tool wildcard matches any tool', () => {
    const d = matchRule([{ tool: '*', decision: 'deny' }], 'Bash', { command: 'rm -rf /' });
    expect(d?.decision).toBe('deny');
  });

  test('regex match against path', () => {
    const d = matchRule(
      [{ tool: 'Read', match: 'secret', decision: 'deny' }],
      'Read',
      { file_path: '/etc/secret.txt' },
    );
    expect(d?.decision).toBe('deny');
  });

  test('non-matching path returns null', () => {
    const d = matchRule(
      [{ tool: 'Read', match: 'secret', decision: 'deny' }],
      'Read',
      { file_path: '/tmp/open.txt' },
    );
    expect(d).toBeNull();
  });

  test('first matching rule wins', () => {
    const d = matchRule(
      [
        { tool: 'Bash', match: '^ls', decision: 'allow' },
        { tool: 'Bash', decision: 'deny' },
      ],
      'Bash',
      { command: 'ls -la' },
    );
    expect(d?.decision).toBe('allow');
  });

  test('invalid regex falls back to substring', () => {
    const d = matchRule(
      [{ tool: 'Bash', match: '(', decision: 'deny' }],
      'Bash',
      { command: 'echo (' },
    );
    expect(d?.decision).toBe('deny');
  });
});
