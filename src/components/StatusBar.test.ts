import { describe, expect, test } from 'bun:test';
import { renderTemplate } from './StatusBar.js';

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
