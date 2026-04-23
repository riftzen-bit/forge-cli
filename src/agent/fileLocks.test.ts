import { describe, expect, test } from 'bun:test';
import { FileCoordinator, FileLockManager, lockKeyFor } from './fileLocks.js';

describe('FileCoordinator (write-only)', () => {
  test('same-key exclusive acquires serialize', async () => {
    const m = new FileCoordinator();
    const order: string[] = [];

    const r1 = await m.acquire('k', 'write');
    const p2 = m.acquire('k', 'write').then((r) => {
      order.push('b');
      r();
    });
    order.push('a');
    r1();
    await p2;
    expect(order).toEqual(['a', 'b']);
  });

  test('different keys are independent', async () => {
    const m = new FileCoordinator();
    const r1 = await m.acquire('a', 'write');
    const r2 = await m.acquire('b', 'write');
    r1();
    r2();
    expect(true).toBe(true);
  });

  test('double-release is a no-op', async () => {
    const m = new FileCoordinator();
    const release = await m.acquire('k', 'write');
    release();
    release();
    const r2 = await m.acquire('k', 'write');
    r2();
  });

  test('queued writers run in order', async () => {
    const m = new FileCoordinator();
    const order: number[] = [];
    const r0 = await m.acquire('k', 'write');
    const p1 = m.acquire('k', 'write').then((r) => { order.push(1); r(); });
    const p2 = m.acquire('k', 'write').then((r) => { order.push(2); r(); });
    const p3 = m.acquire('k', 'write').then((r) => { order.push(3); r(); });
    r0();
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });
});

describe('FileCoordinator (shared reads)', () => {
  test('multiple readers run concurrently on same key', async () => {
    const m = new FileCoordinator();
    const r1 = await m.acquire('k', 'read');
    const r2 = await m.acquire('k', 'read');
    const r3 = await m.acquire('k', 'read');
    r1(); r2(); r3();
  });

  test('writer waits for active readers', async () => {
    const m = new FileCoordinator();
    const order: string[] = [];
    const r1 = await m.acquire('k', 'read');
    const r2 = await m.acquire('k', 'read');
    const pw = m.acquire('k', 'write').then((rel) => {
      order.push('w');
      rel();
    });
    order.push('r-release-1');
    r1();
    order.push('r-release-2');
    r2();
    await pw;
    expect(order).toEqual(['r-release-1', 'r-release-2', 'w']);
  });

  test('pending writer blocks new readers (no writer starvation)', async () => {
    const m = new FileCoordinator();
    const order: string[] = [];
    const r1 = await m.acquire('k', 'read');
    const pw = m.acquire('k', 'write').then((rel) => {
      order.push('w');
      rel();
    });
    const pr = m.acquire('k', 'read').then((rel) => {
      order.push('r2');
      rel();
    });
    r1();
    await pw;
    await pr;
    expect(order).toEqual(['w', 'r2']);
  });

  test('batch of readers runs after writer releases', async () => {
    const m = new FileCoordinator();
    const order: string[] = [];
    const w = await m.acquire('k', 'write');
    const pr1 = m.acquire('k', 'read').then((rel) => { order.push('r1'); rel(); });
    const pr2 = m.acquire('k', 'read').then((rel) => { order.push('r2'); rel(); });
    w();
    await Promise.all([pr1, pr2]);
    expect(order.sort()).toEqual(['r1', 'r2']);
  });
});

describe('FileLockManager alias', () => {
  test('still exported for backwards compat', () => {
    expect(FileLockManager).toBe(FileCoordinator);
  });
});

describe('lockKeyFor', () => {
  test('Read yields file: key with read mode', () => {
    const cwd = process.platform === 'win32' ? 'C:\\proj' : '/proj';
    const req = lockKeyFor('Read', { file_path: 'src/a.ts' }, cwd);
    expect(req).not.toBeNull();
    expect(req!.key).toMatch(/^file:/);
    expect(req!.key).toContain('a.ts');
    expect(req!.mode).toBe('read');
  });

  test('Edit yields write mode', () => {
    const cwd = process.platform === 'win32' ? 'C:\\proj' : '/proj';
    const req = lockKeyFor('Edit', { file_path: 'src/a.ts' }, cwd);
    expect(req!.mode).toBe('write');
  });

  test('Write yields write mode', () => {
    const cwd = process.platform === 'win32' ? 'C:\\proj' : '/proj';
    const req = lockKeyFor('Write', { file_path: 'src/a.ts' }, cwd);
    expect(req!.mode).toBe('write');
  });

  test('Bash yields the global bash key (write mode)', () => {
    const req = lockKeyFor('Bash', { command: 'ls' }, process.cwd());
    expect(req).toEqual({ key: '__bash__', mode: 'write' });
  });

  test('tools without a path return null', () => {
    expect(lockKeyFor('Grep', { pattern: 'foo' }, process.cwd())).toBeNull();
  });

  test('same path under different separators normalizes to the same key', () => {
    if (process.platform !== 'win32') return;
    const a = lockKeyFor('Read', { file_path: 'C:\\proj\\src\\a.ts' }, 'C:\\proj');
    const b = lockKeyFor('Read', { file_path: 'C:/proj/src/a.ts' }, 'C:\\proj');
    expect(a!.key).toBe(b!.key);
  });
});
