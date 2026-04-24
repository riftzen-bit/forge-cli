import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, basename, extname } from 'node:path';
import type { ChatMessage } from '../components/MessageList.js';

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
  return one.length > n ? one.slice(0, n - 1) + '...' : one;
}

type SdkContentBlock = {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: Record<string, unknown>;
  id?: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
};

type SdkLine = {
  type?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  message?: { role?: string; content?: unknown };
};

function blocksOf(content: unknown): SdkContentBlock[] {
  if (Array.isArray(content)) return content as SdkContentBlock[];
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return [];
}

// Parse a session JSONL file into the same ChatMessage[] shape the live UI
// uses, so a resumed session re-renders the prior conversation instead of
// leaving the screen blank.
//
// Faithful-but-compact: emit user text, each assistant text block as its
// own message (matches the per-block streaming behaviour), tool_use blocks
// as 'tool' rows, and pair tool_result outputs with their tool_use by id so
// the row's status/output is restored. Skips thinking blocks (noisy on
// reload), result/system meta events, and any malformed lines.
export async function loadSessionMessages(file: string): Promise<ChatMessage[]> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  const messages: ChatMessage[] = [];
  const toolIndex = new Map<string, number>();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let obj: SdkLine;
    try {
      obj = JSON.parse(line) as SdkLine;
    } catch {
      continue;
    }
    // Skip meta lines (local-command caveats, sidechain subagent traces,
    // attachments, file-history snapshots, system meta). Only conversational
    // user/assistant turns are restored to the visible scrollback.
    if (obj.isMeta || obj.isSidechain) continue;
    if (obj.type === 'attachment') continue;
    if (obj.type === 'file-history-snapshot') continue;
    if (obj.type === 'system') continue;
    if (obj.type === 'queue-operation') continue;
    if (obj.type === 'last-prompt') continue;
    // Forge / claude-agent-sdk assistant lines OMIT the top-level `type` field
    // and identify the speaker only via `message.role`. Claude Code lines DO
    // have `type:"user"` etc. Handle both by routing on `message.role` first.
    const role = obj.message?.role;
    if (!obj.message || (role !== 'user' && role !== 'assistant')) continue;
    if (role === 'user') {
      const blocks = blocksOf(obj.message?.content);
      for (const b of blocks) {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          // Skip Claude Code internal command caveats — they're noise on reload.
          if (/^<(local-command-caveat|command-name|command-message)/.test(b.text.trim())) continue;
          messages.push({ role: 'user', text: b.text });
        } else if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
          const idx = toolIndex.get(b.tool_use_id);
          if (idx === undefined) continue;
          const prev = messages[idx];
          if (!prev || prev.role !== 'tool') continue;
          let preview = '';
          if (typeof b.content === 'string') preview = b.content;
          else if (Array.isArray(b.content)) {
            for (const c of b.content as SdkContentBlock[]) {
              if (c.type === 'text' && typeof c.text === 'string') {
                preview = c.text;
                break;
              }
            }
          }
          messages[idx] = {
            ...prev,
            status: b.is_error ? 'err' : 'ok',
            output: preview,
          };
        }
      }
    } else if (role === 'assistant') {
      const blocks = blocksOf(obj.message?.content);
      for (const b of blocks) {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          messages.push({ role: 'assistant', text: b.text });
        } else if (b.type === 'tool_use' && typeof b.name === 'string') {
          const input = (b.input ?? {}) as Record<string, unknown>;
          const tip = previewToolInput(b.name, input);
          const msg: ChatMessage = {
            role: 'tool',
            tool: b.name,
            input,
            text: tip,
            status: 'ok',
          };
          if (typeof b.id === 'string') msg.id = b.id;
          messages.push(msg);
          if (typeof b.id === 'string') toolIndex.set(b.id, messages.length - 1);
        }
      }
    }
  }
  return messages;
}

function previewToolInput(tool: string, input: Record<string, unknown>): string {
  const fields = ['file_path', 'path', 'pattern', 'command', 'url', 'query'];
  for (const k of fields) {
    const v = input[k];
    if (typeof v === 'string' && v) {
      return v.length > 80 ? v.slice(0, 77) + '...' : v;
    }
  }
  return '';
}
