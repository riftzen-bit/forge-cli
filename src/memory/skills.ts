// Skill discovery. Mirrors Claude Code's `~/.claude/skills/<name>/SKILL.md`
// convention plus the `~/.forge/skills/...` Forge-native variant. Loads only
// the YAML front-matter (name + description) so we can give the model a
// cheap catalog of capabilities it can opt into via Read on the SKILL.md
// when a relevant trigger fires.
//
// We deliberately do NOT inline skill bodies into the system prompt — they
// can be long and most never apply to a given turn. The catalog is small;
// the agent reads the full body on demand.

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export type SkillEntry = {
  name: string;
  description: string;
  path: string;
  scope: 'user' | 'project';
};

export type LoadSkillsOptions = {
  cwd?: string;
  home?: string;
};

const SKILL_FILE = 'SKILL.md';
// Skill roots, in priority order. User-scope first so a project can override
// by name. Caller dedupes on lowercased skill name.
const SKILL_ROOTS_USER = ['.claude/skills', '.forge/skills'] as const;
const SKILL_ROOTS_PROJECT = ['.claude/skills', '.forge/skills'] as const;

// Front-matter cache keyed by absolute path. Cheap; SKILL.md files are
// small but loading on every send() would still cost dozens of stat+reads.
const cache = new Map<string, { mtimeMs: number; entry: SkillEntry } | null>();

function parseFrontMatter(raw: string): Record<string, string> | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const body = m[1]!;
  const out: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const kv = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[kv[1]!.toLowerCase()] = v;
  }
  return out;
}

async function readSkill(path: string, scope: SkillEntry['scope']): Promise<SkillEntry | null> {
  let st;
  try { st = await stat(path); }
  catch { return null; }
  const cached = cache.get(path);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.entry;
  let raw: string;
  try { raw = await readFile(path, 'utf8'); }
  catch { cache.set(path, null); return null; }
  const fm = parseFrontMatter(raw);
  if (!fm || !fm['name']) {
    cache.set(path, null);
    return null;
  }
  const entry: SkillEntry = {
    name: fm['name']!,
    description: fm['description'] ?? '',
    path,
    scope,
  };
  cache.set(path, { mtimeMs: st.mtimeMs, entry });
  return entry;
}

async function scanRoot(root: string, scope: SkillEntry['scope']): Promise<SkillEntry[]> {
  if (!existsSync(root)) return [];
  let dirs;
  try { dirs = await readdir(root, { withFileTypes: true }); }
  catch { return []; }
  const out: SkillEntry[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const skillPath = join(root, d.name, SKILL_FILE);
    const e = await readSkill(skillPath, scope);
    if (e) out.push(e);
  }
  return out;
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

export async function loadSkillIndex(opts: LoadSkillsOptions = {}): Promise<SkillEntry[]> {
  const home = opts.home ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const seenName = new Set<string>();
  const out: SkillEntry[] = [];

  for (const sub of SKILL_ROOTS_USER) {
    const entries = await scanRoot(join(home, sub), 'user');
    for (const e of entries) {
      const k = e.name.toLowerCase();
      if (seenName.has(k)) continue;
      seenName.add(k);
      out.push(e);
    }
  }

  const root = findGitRoot(cwd) ?? cwd;
  for (const sub of SKILL_ROOTS_PROJECT) {
    const entries = await scanRoot(join(root, sub), 'project');
    for (const e of entries) {
      const k = e.name.toLowerCase();
      if (seenName.has(k)) continue;
      seenName.add(k);
      out.push(e);
    }
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function formatSkillIndex(entries: ReadonlyArray<SkillEntry>): string {
  if (entries.length === 0) return '';
  const lines: string[] = [];
  lines.push('# Available skills');
  lines.push('');
  lines.push("Each skill is a self-contained playbook for a recurring task. When the user's request matches a skill's trigger, Read the SKILL.md from the path shown and follow it. Don't paraphrase from this catalog — open the file. Do not invoke a skill that is not listed here.");
  lines.push('');
  for (const e of entries) {
    const desc = e.description ? ` — ${e.description}` : '';
    lines.push(`- **${e.name}** (${e.scope}): ${e.path}${desc}`);
  }
  return lines.join('\n');
}

export function clearSkillCache(): void {
  cache.clear();
}
