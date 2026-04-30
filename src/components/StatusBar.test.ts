import { describe, expect, test } from 'bun:test';
import { renderModelStatus, renderTemplate } from './StatusBar.js';
import { authBadge } from '../auth/status.js';

describe('renderTemplate', () => {
  test('replaces known vars', () => {
    const out = renderTemplate('{model} @ {cwd}', { model: 'opus', cwd: '/p' });
    expect(out).toBe('opus @ /p');
  });

  test('unknown vars become empty', () => {
    expect(renderTemplate('[{x}]', {})).toBe('[]');
  });

  test('preserves non-placeholder text', () => {
    expect(renderTemplate('literal {{keep}}', { keep: 'x' })).toBe('literal {x}');
  });
});

describe('renderModelStatus', () => {
  test('hides provider in narrow status so auth stays visible', () => {
    expect(renderModelStatus('Opus', 'Anthropic', 59)).toBe('Opus');
  });

  test('still hides provider in medium status', () => {
    expect(renderModelStatus('Opus', 'Anthropic', 71)).toBe('Opus');
  });

  test('shows provider in wide status', () => {
    expect(renderModelStatus('Opus', 'Anthropic', 72)).toBe('Opus@Anthropic');
  });
});


describe('authBadge', () => {
  test('labels Codex session auth as signed in', () => {
    expect(authBadge({ kind: 'session' })).toEqual({ label: 'session', color: 'green' });
  });
});
