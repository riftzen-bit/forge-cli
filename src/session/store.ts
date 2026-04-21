import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, basename, extname } from 'node:path';

export type SessionSummary = {
  id: string;
  file: string;
  project: string;
  mtime: number;
  preview: string;
};

const ROOT = join(homedir(), '.claude', 'projects');

async function safeList(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function firstUserLine(file: string): Promise<string> {
  try {
    const raw = await readFile(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line) as {
          type?: string;
          message?: { role?: string; content?: unknown };
        };
        if (obj.type === 'user' && obj.message?.role === 'user') {
          const c = obj.message.content;
          if (typeof c === 'string') return c.trim();
          if (Array.isArray(c)) {
            for (const b of c as Array<{ type?: string; text?: string }>) {
              if (b.type === 'text' && b.text) return b.text.trim();
            }
          }
        }
      } catch {
        /* malformed line, skip */
      }
    }
  } catch {
    /* missing or unreadable */
  }
  return '(no preview)';
}

export async function listSessions(limit = 25): Promise<SessionSummary[]> {
  const projects = await safeList(ROOT);
  const out: SessionSummary[] = [];

  for (const project of projects) {
    const dir = join(ROOT, project);
    const files = await safeList(dir);
    for (const name of files) {
      if (extname(name) !== '.jsonl') continue;
      const file = join(dir, name);
      let mtime = 0;
      try {
        const s = await stat(file);
        mtime = s.mtimeMs;
      } catch {
        continue;
      }
      out.push({
        id: basename(name, '.jsonl'),
        file,
        project,
        mtime,
        preview: '',
      });
    }
  }

  out.sort((a, b) => b.mtime - a.mtime);
  const top = out.slice(0, limit);
  await Promise.all(
    top.map(async (s) => {
      s.preview = await firstUserLine(s.file);
    }),
  );
  return top;
}

export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const now = Date.now();
  const diff = now - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toISOString().slice(0, 10);
}

export function truncate(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}
