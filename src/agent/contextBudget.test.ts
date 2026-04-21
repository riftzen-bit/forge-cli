import { describe, expect, test } from 'bun:test';
import { estimateTokens, contextState, CONTEXT_LIMIT, WARN_THRESHOLD, COMPACT_THRESHOLD } from './contextBudget.js';

describe('contextBudget', () => {
  test('thresholds are ordered', () => {
    expect(WARN_THRESHOLD).toBeLessThan(COMPACT_THRESHOLD);
    expect(COMPACT_THRESHOLD).toBeLessThan(CONTEXT_LIMIT);
  });

  test('estimateTokens scales roughly with length', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  test('contextState transitions at thresholds', () => {
    expect(contextState(0)).toBe('ok');
    expect(contextState(WARN_THRESHOLD - 1)).toBe('ok');
    expect(contextState(WARN_THRESHOLD)).toBe('warn');
    expect(contextState(COMPACT_THRESHOLD - 1)).toBe('warn');
    expect(contextState(COMPACT_THRESHOLD)).toBe('compact');
    expect(contextState(CONTEXT_LIMIT)).toBe('compact');
  });
});
