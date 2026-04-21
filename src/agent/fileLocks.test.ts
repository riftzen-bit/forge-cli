import { describe, expect, test } from 'bun:test';
import { FileLockManager, lockKeyFor } from './fileLocks.js';

describe('FileLockManager', () => {
  test('same-key acquires serialize', async () => {
    const m = new FileLockManager();
    const order: string[] = [];

    const r1 = await m.acquire('k');
    const p2 = m.acquire('k').then((r) => {
      order.push('b');
      r();
    });
    order.push('a');
    r1();
    await p2;
    expect(order).toEqual(['a', 'b']);
  });

  test('different keys are independent', async () => {
    const m = new FileLockManager();
    const r1 = await m.acquire('a');
    const r2 = await m.acquire('b');
    r1();
    r2();
    expect(true).toBe(true);
  });

  test('double-release is a no-op', async () => {
    const m = new FileLockManager();
    const release = await m.acquire('k');
    release();
    release();
    const r2 = await m.acquire('k');
    r2();
  });

  test('queued waiters run in order', async () => {
    const m = new FileLockManager();
    const order: number[] = [];
    const r0 = await m.acquire('k');
    const p1 = m.acquire('k').then((r) => { order.push(1); r(); });
    const p2 = m.acquire('k').then((r) => { order.push(2); r(); });
    const p3 = m.acquire('k').then((r) => { order.push(3); r(); });
    r0();
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });
});

describe('lockKeyFor', () => {
  test('file_path yields a file: key', () => {
    const cwd = process.platform === 'win32' ? 'C:\\proj' : '/proj';
    const k = lockKeyFor('Read', { file_path: 'src/a.ts' }, cwd);
    expect(k).toMatch(/^file:/);
    expect(k).toContain('a.ts');
  });

  test('Bash yields the global bash key', () => {
    expect(lockKeyFor('Bash', { command: 'ls' }, process.cwd())).toBe('__bash__');
  });

  test('tools without a path return null', () => {
    expect(lockKeyFor('Grep', { pattern: 'foo' }, process.cwd())).toBeNull();
  });

  test('same path under different separators normalizes to the same key', () => {
    if (process.platform !== 'win32') return;
    const a = lockKeyFor('Read', { file_path: 'C:\\proj\\src\\a.ts' }, 'C:\\proj');
    const b = lockKeyFor('Read', { file_path: 'C:/proj/src/a.ts' }, 'C:\\proj');
    expect(a).toBe(b);
  });
});
