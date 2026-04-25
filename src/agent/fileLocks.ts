import path from 'node:path';

export type Release = () => void;
export type Mode = 'read' | 'write';

type Waiter = { mode: Mode; grant: () => void };

type Entry = {
  readers: number;
  writer: boolean;
  queue: Waiter[];
};

export class FileCoordinator {
  private entries = new Map<string, Entry>();

  async acquire(key: string, mode: Mode = 'write'): Promise<Release> {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { readers: 0, writer: false, queue: [] };
      this.entries.set(key, entry);
    }

    if (this.canGrant(entry, mode)) {
      this.grant(entry, mode);
    } else {
      // The releaser updates state (writer/readers) before grant() resolves,
      // so we must NOT call grant() again here or we'd double-count.
      await new Promise<void>((resolve) => {
        entry!.queue.push({ mode, grant: resolve });
      });
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release(key, mode);
    };
  }

  private canGrant(entry: Entry, mode: Mode): boolean {
    if (entry.writer) return false;
    if (mode === 'write') return entry.readers === 0 && entry.queue.length === 0;
    // read: let readers in if no writer holds it AND head of queue is not a writer
    const head = entry.queue[0];
    if (head && head.mode === 'write') return false;
    return true;
  }

  private grant(entry: Entry, mode: Mode): void {
    if (mode === 'write') entry.writer = true;
    else entry.readers += 1;
  }

  private release(key: string, mode: Mode): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (mode === 'write') entry.writer = false;
    else entry.readers = Math.max(0, entry.readers - 1);

    // Drain queue: grant writer if alone-eligible, or consecutive readers.
    // We must mutate writer/readers BEFORE calling grant() so any synchronous
    // acquire() that runs after grant resolves sees the lock as already held.
    while (entry.queue.length > 0) {
      const next = entry.queue[0]!;
      if (next.mode === 'write') {
        if (entry.readers === 0 && !entry.writer) {
          entry.queue.shift();
          entry.writer = true;
          next.grant();
          return;
        }
        break;
      } else {
        if (entry.writer) break;
        entry.queue.shift();
        entry.readers += 1;
        next.grant();
      }
    }

    if (entry.readers === 0 && !entry.writer && entry.queue.length === 0) {
      this.entries.delete(key);
    }
  }
}

// Kept as deprecated alias so other callers keep compiling.
export { FileCoordinator as FileLockManager };

export type LockRequest = { key: string; mode: Mode };

const READ_TOOLS = new Set(['Read', 'NotebookRead']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

export function lockKeyFor(
  tool: string,
  input: Record<string, unknown>,
  cwd: string,
): LockRequest | null {
  const pathKeys = ['file_path', 'path', 'notebook_path'];
  for (const k of pathKeys) {
    const v = input[k];
    if (typeof v === 'string' && v.trim()) {
      const mode: Mode = WRITE_TOOLS.has(tool)
        ? 'write'
        : READ_TOOLS.has(tool)
          ? 'read'
          : 'write';
      return { key: `file:${normalize(v, cwd)}`, mode };
    }
  }
  if (tool === 'Bash') return { key: '__bash__', mode: 'write' };
  return null;
}

function normalize(p: string, cwd: string): string {
  const abs = path.isAbsolute(p) ? p : path.resolve(cwd, p);
  const norm = path.normalize(abs).replace(/\\/g, '/');
  return process.platform === 'win32' ? norm.toLowerCase() : norm;
}
