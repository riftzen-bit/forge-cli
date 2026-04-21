import path from 'node:path';

export type Release = () => void;

export class FileLockManager {
  private chains = new Map<string, Promise<void>>();

  async acquire(key: string): Promise<Release> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    let resolveNext!: () => void;
    const next = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });
    const waitChain = prev.then(() => next);
    this.chains.set(key, waitChain);

    await prev;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      resolveNext();
      if (this.chains.get(key) === waitChain) {
        this.chains.delete(key);
      }
    };
  }
}

export function lockKeyFor(
  tool: string,
  input: Record<string, unknown>,
  cwd: string,
): string | null {
  const pathKeys = ['file_path', 'path', 'notebook_path'];
  for (const k of pathKeys) {
    const v = input[k];
    if (typeof v === 'string' && v.trim()) {
      return `file:${normalize(v, cwd)}`;
    }
  }
  if (tool === 'Bash') return '__bash__';
  return null;
}

function normalize(p: string, cwd: string): string {
  const abs = path.isAbsolute(p) ? p : path.resolve(cwd, p);
  const norm = path.normalize(abs).replace(/\\/g, '/');
  return process.platform === 'win32' ? norm.toLowerCase() : norm;
}
