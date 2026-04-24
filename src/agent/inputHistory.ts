import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CONFIG_DIR } from '../config/paths.js';

const HISTORY_PATH = join(CONFIG_DIR, 'history.jsonl');

type Entry = { t: number; text: string };

export class InputHistory {
  private entries: string[] = [];
  private max: number;
  private cursor = -1;

  constructor(max = 500) {
    this.max = max;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(HISTORY_PATH, 'utf8');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line) as Entry;
          if (typeof obj.text === 'string' && obj.text) this.entries.push(obj.text);
        } catch {
          /* skip malformed */
        }
      }
      if (this.entries.length > this.max) {
        this.entries = this.entries.slice(-this.max);
      }
    } catch {
      /* no history yet */
    }
  }

  async append(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (this.entries[this.entries.length - 1] === trimmed) return;
    this.entries.push(trimmed);
    if (this.entries.length > this.max) {
      this.entries = this.entries.slice(-this.max);
      await this.rewrite();
    } else {
      try {
        await mkdir(dirname(HISTORY_PATH), { recursive: true });
        await appendFile(HISTORY_PATH, JSON.stringify({ t: Date.now(), text: trimmed }) + '\n', 'utf8');
      } catch {
        /* best-effort */
      }
    }
    this.cursor = -1;
  }

  private async rewrite(): Promise<void> {
    try {
      await mkdir(dirname(HISTORY_PATH), { recursive: true });
      const body = this.entries
        .map((text) => JSON.stringify({ t: Date.now(), text }))
        .join('\n') + '\n';
      await writeFile(HISTORY_PATH, body, 'utf8');
    } catch {
      /* best-effort */
    }
  }

  resetCursor(): void {
    this.cursor = -1;
  }

  up(): string | null {
    if (this.entries.length === 0) return null;
    if (this.cursor === -1) this.cursor = this.entries.length - 1;
    else if (this.cursor > 0) this.cursor -= 1;
    return this.entries[this.cursor] ?? null;
  }

  down(): string | null {
    if (this.cursor === -1) return null;
    if (this.cursor >= this.entries.length - 1) {
      this.cursor = -1;
      return '';
    }
    this.cursor += 1;
    return this.entries[this.cursor] ?? null;
  }

  last(): string | null {
    return this.entries.length > 0 ? (this.entries[this.entries.length - 1] ?? null) : null;
  }
}
