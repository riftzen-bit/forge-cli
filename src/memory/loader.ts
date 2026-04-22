import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export type MemoryType = 'User' | 'Project' | 'Local';

export type MemoryFile = {
  path: string;
  type: MemoryType;
  content: string;
  parent?: string;
};

const MAX_INCLUDE_DEPTH = 5;
const MEMORY_INSTRUCTION_PROMPT =
  'Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.';

export type LoadOptions = {
  cwd?: string;
  home?: string;
};

function normalize(p: string): string {
  return resolve(p);
}

function stripFencedCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

export function extractIncludes(text: string, baseDir: string, home: string): string[] {
  const scrubbed = stripFencedCode(text);
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /(?:^|[\s(])@((?:\\ |[^\s()])+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scrubbed)) !== null) {
    let raw = m[1]!;
    const hash = raw.indexOf('#');
    if (hash !== -1) raw = raw.slice(0, hash);
    raw = raw.replace(/\\ /g, ' ');
    if (!raw) continue;
    if (raw.startsWith('@')) continue;
    const valid =
      raw.startsWith('./') ||
      raw.startsWith('../') ||
      raw.startsWith('~/') ||
      (raw.startsWith('/') && raw !== '/') ||
      /^[A-Za-z]:[\\/]/.test(raw) ||
      /^[A-Za-z0-9._-]/.test(raw);
    if (!valid) continue;
    let full: string;
    if (raw.startsWith('~/')) full = join(home, raw.slice(2));
    else if (isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) full = raw;
    else full = join(baseDir, raw);
    const n = normalize(full);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

async function readSafe(path: string): Promise<string | null> {
  try {
    const content = await readFile(path, 'utf8');
    return content;
  } catch {
    return null;
  }
}

async function processFile(
  path: string,
  type: MemoryType,
  home: string,
  seen: Set<string>,
  depth: number,
  parent: string | undefined,
  out: MemoryFile[],
): Promise<void> {
  const n = normalize(path);
  if (seen.has(n)) return;
  if (depth >= MAX_INCLUDE_DEPTH) return;
  const raw = await readSafe(n);
  if (raw === null) return;
  const content = raw.trim();
  if (!content) return;
  seen.add(n);
  const file: MemoryFile = { path: n, type, content };
  if (parent) file.parent = parent;
  out.push(file);
  const includes = extractIncludes(content, dirname(n), home);
  for (const inc of includes) {
    await processFile(inc, type, home, seen, depth + 1, n, out);
  }
}

function findGitRoot(from: string): string | null {
  let cur = resolve(from);
  while (true) {
    if (existsSync(join(cur, '.git'))) return cur;
    const up = dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
}

function walkUp(from: string): string[] {
  const cwd = resolve(from);
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) return [cwd];
  const dirs: string[] = [];
  const norm = (p: string) => normalize(p).toLowerCase();
  const stop = norm(gitRoot);
  let cur = cwd;
  while (true) {
    dirs.push(cur);
    if (norm(cur) === stop) break;
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return dirs;
}

export async function loadMemoryFiles(opts: LoadOptions = {}): Promise<MemoryFile[]> {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? homedir();
  const seen = new Set<string>();
  const out: MemoryFile[] = [];

  const userCandidates = [
    join(home, '.claude', 'CLAUDE.md'),
    join(home, '.forge', 'CLAUDE.md'),
  ];
  for (const p of userCandidates) {
    await processFile(p, 'User', home, seen, 0, undefined, out);
  }

  const dirs = walkUp(cwd).reverse();
  for (const dir of dirs) {
    await processFile(join(dir, 'CLAUDE.md'), 'Project', home, seen, 0, undefined, out);
    await processFile(join(dir, '.claude', 'CLAUDE.md'), 'Project', home, seen, 0, undefined, out);
    await processFile(join(dir, 'CLAUDE.local.md'), 'Local', home, seen, 0, undefined, out);
  }

  return out;
}

export function formatMemoryPrompt(files: MemoryFile[]): string {
  if (files.length === 0) return '';
  const blocks: string[] = [];
  for (const f of files) {
    const desc =
      f.type === 'Project'
        ? ' (project instructions, checked into the codebase)'
        : f.type === 'Local'
          ? " (user's private project instructions, not checked in)"
          : " (user's private global instructions for all projects)";
    blocks.push(`Contents of ${f.path}${desc}:\n\n${f.content}`);
  }
  return `${MEMORY_INSTRUCTION_PROMPT}\n\n${blocks.join('\n\n')}`;
}

export function stripFencedCodeForTest(s: string): string {
  return stripFencedCode(s);
}
