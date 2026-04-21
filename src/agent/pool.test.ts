import { describe, expect, test } from 'bun:test';
import { parseParallelTasks } from './pool.js';

describe('parseParallelTasks', () => {
  test('splits on || with trimming', () => {
    expect(parseParallelTasks('a || b || c')).toEqual(['a', 'b', 'c']);
  });

  test('drops empty segments', () => {
    expect(parseParallelTasks('a || || b')).toEqual(['a', 'b']);
  });

  test('empty input is an empty list', () => {
    expect(parseParallelTasks('')).toEqual([]);
  });

  test('single task is preserved', () => {
    expect(parseParallelTasks('just one')).toEqual(['just one']);
  });
});
