import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve, relative } from 'node:path';

export type Mention = { raw: string; path: string; abs: string };

const MAX_BYTES = 64 * 1024;
const MAX_LINES = 400;

const MENTION_PATTERN = '(?:^|[\\s(])@((?:\\\\ |[^\\s()@])+)';

function stripFencedCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

export function extractMentionCandidates(text: string): string[] {
  const scrubbed = stripFencedCode(text);
  const out: string[] = [];
  const seen = new Set<string>();
  // Fresh regex per call so concurrent callers don't clobber lastIndex.
  const re = new RegExp(MENTION_PATTERN, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(scrubbed)) !== null) {
    let raw = m[1]!;
    raw = raw.replace(/\\ /g, ' ');
    if (!raw || raw.startsWith('@')) continue;
    if (!seen.has(raw)) {
      seen.add(raw);
      out.push(raw);
    }
  }
  return out;
}

export async function resolveMentions(text: string, cwd: string): Promise<Mention[]> {
  const cands = extractMentionCandidates(text);
  const out: Mention[] = [];
  for (const raw of cands) {
    const abs = isAbsolute(raw) ? raw : resolve(cwd, raw);
    try {
      const s = await stat(abs);
      if (!s.isFile()) continue;
      out.push({ raw, path: relative(cwd, abs) || raw, abs });
    } catch {
      /* not a file */
    }
  }
  return out;
}

export async function buildMentionBlock(mentions: Mention[]): Promise<string> {
  if (mentions.length === 0) return '';
  const blocks: string[] = [];
  for (const m of mentions) {
    try {
      const raw = await readFile(m.abs, 'utf8');
      let body = raw;
      if (body.length > MAX_BYTES) body = body.slice(0, MAX_BYTES) + '\n... [truncated]';
      const lines = body.split(/\r?\n/);
      if (lines.length > MAX_LINES) {
        body = lines.slice(0, MAX_LINES).join('\n') + `\n... [${lines.length - MAX_LINES} more lines]`;
      }
      blocks.push(`<file path="${m.path}">\n${body}\n</file>`);
    } catch {
      /* unreadable, skip */
    }
  }
  if (blocks.length === 0) return '';
  return `The user attached these files via @-mentions. Treat them as context; do not re-read unless necessary.\n\n${blocks.join('\n\n')}`;
}

export async function expandMentions(text: string, cwd: string): Promise<{ prompt: string; files: string[] }> {
  const mentions = await resolveMentions(text, cwd);
  if (mentions.length === 0) return { prompt: text, files: [] };
  const block = await buildMentionBlock(mentions);
  if (!block) return { prompt: text, files: [] };
  return { prompt: `${block}\n\n${text}`, files: mentions.map((m) => m.path) };
}
