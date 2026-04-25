import { describe, expect, test } from 'bun:test';
import { indexAtRowCol, lineCount, rowColAt } from './SimpleTextInput.js';

describe('rowColAt', () => {
  test('returns (0,0) for empty buffer', () => {
    expect(rowColAt('', 0)).toEqual({ row: 0, col: 0 });
  });

  test('counts column on the first line', () => {
    expect(rowColAt('hello world', 5)).toEqual({ row: 0, col: 5 });
  });

  test('jumps to next row after a newline', () => {
    expect(rowColAt('a\nbc', 2)).toEqual({ row: 1, col: 0 });
    expect(rowColAt('a\nbc', 4)).toEqual({ row: 1, col: 2 });
  });

  test('handles consecutive newlines (empty lines)', () => {
    expect(rowColAt('a\n\nb', 2)).toEqual({ row: 1, col: 0 });
    expect(rowColAt('a\n\nb', 3)).toEqual({ row: 2, col: 0 });
  });
});

describe('indexAtRowCol', () => {
  test('clamps to end-of-line when target column is past line length', () => {
    expect(indexAtRowCol('abc\nx', 1, 99)).toBe(5);
  });

  test('round-trips with rowColAt', () => {
    const text = 'first line\nsecond longer line\nshort';
    for (let i = 0; i <= text.length; i++) {
      const rc = rowColAt(text, i);
      expect(indexAtRowCol(text, rc.row, rc.col)).toBe(i);
    }
  });

  test('row past last clamps to buffer end', () => {
    expect(indexAtRowCol('abc', 5, 0)).toBe(3);
  });

  test('negative row clamps to 0', () => {
    expect(indexAtRowCol('abc', -1, 0)).toBe(0);
  });
});

describe('lineCount', () => {
  test('empty buffer has one row', () => {
    expect(lineCount('')).toBe(1);
  });

  test('single line buffer is one row', () => {
    expect(lineCount('hello')).toBe(1);
  });

  test('counts every newline as a row separator', () => {
    expect(lineCount('a\nb')).toBe(2);
    expect(lineCount('a\nb\nc')).toBe(3);
    expect(lineCount('a\n')).toBe(2);
  });
});
