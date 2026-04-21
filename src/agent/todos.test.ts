import { describe, expect, test } from 'bun:test';
import { TodoStore, formatTodoSummary } from './todos.js';

describe('TodoStore', () => {
  test('add assigns monotonic ids', () => {
    const s = new TodoStore();
    expect(s.add('a').id).toBe(1);
    expect(s.add('b').id).toBe(2);
    expect(s.list()).toHaveLength(2);
  });

  test('setStatus updates existing and returns false for missing', () => {
    const s = new TodoStore();
    s.add('x');
    expect(s.setStatus(1, 'done')).toBe(true);
    expect(s.list()[0]!.status).toBe('done');
    expect(s.setStatus(99, 'done')).toBe(false);
  });

  test('remove drops by id', () => {
    const s = new TodoStore();
    s.add('x');
    s.add('y');
    expect(s.remove(1)).toBe(true);
    expect(s.list().map((t) => t.text)).toEqual(['y']);
  });

  test('clear resets state and ids', () => {
    const s = new TodoStore();
    s.add('a');
    s.clear();
    expect(s.list()).toEqual([]);
    expect(s.add('b').id).toBe(1);
  });

  test('subscribe fires on changes; unsubscribe stops', () => {
    const s = new TodoStore();
    let last = 0;
    const off = s.subscribe((items) => { last = items.length; });
    s.add('a');
    s.add('b');
    expect(last).toBe(2);
    off();
    s.add('c');
    expect(last).toBe(2);
  });

  test('formatTodoSummary shows empty hint and rows', () => {
    const s = new TodoStore();
    expect(formatTodoSummary(s.list())).toContain('no todos');
    s.add('ship it');
    const out = formatTodoSummary(s.list());
    expect(out).toContain('ship it');
    expect(out).toContain('[ ]');
  });
});
