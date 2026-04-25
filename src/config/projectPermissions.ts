// Per-project permission storage. Lives at <cwd>/.forge/permissions.json.
// When the user picks "Yes Allow Session" on a permission prompt, we generate
// a match pattern from the tool + input and append a rule. Subsequent calls
// matching that pattern auto-allow without re-prompting.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { PermissionRule } from './settings.js';

const ProjectRuleSchema = z.object({
  tool: z.string(),
  match: z.string().optional(),
  decision: z.enum(['allow', 'deny']),
  addedAt: z.string().optional(),
});

const ProjectPermissionsSchema = z.object({
  allowed: z.array(ProjectRuleSchema).default([]),
});

export type ProjectRule = z.infer<typeof ProjectRuleSchema>;
export type ProjectPermissions = z.infer<typeof ProjectPermissionsSchema>;

export const PROJECT_PERMS_DIR = '.forge';
export const PROJECT_PERMS_FILE = 'permissions.json';

export function projectPermissionsPath(cwd: string): string {
  return join(cwd, PROJECT_PERMS_DIR, PROJECT_PERMS_FILE);
}

export async function loadProjectPermissions(cwd: string): Promise<ProjectPermissions> {
  try {
    const raw = await readFile(projectPermissionsPath(cwd), 'utf8');
    return ProjectPermissionsSchema.parse(JSON.parse(raw));
  } catch {
    return { allowed: [] };
  }
}

// Serialize writes per-cwd so two concurrent "Yes Allow Session" grants
// can't race and lose one. The chain is a promise that every caller awaits
// before performing its own read-modify-write cycle. Lives in-process;
// different processes on the same cwd can still race, but that would
// require two concurrent Forge instances — we accept that as out of scope.
const writeChains = new Map<string, Promise<unknown>>();

export async function appendProjectAllow(cwd: string, rule: ProjectRule): Promise<ProjectPermissions> {
  // Normalize so differing spellings of the same directory (trailing
  // separator, mixed case on Windows, relative vs absolute) share the same
  // write chain; without this the read-modify-write race this chain is
  // designed to prevent re-emerges.
  const resolved = resolve(cwd);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const prev = writeChains.get(key) ?? Promise.resolve();
  const next = prev.then(async () => {
    const cur = await loadProjectPermissions(cwd);
    const exists = cur.allowed.some(
      (r) => r.tool === rule.tool && r.match === rule.match && r.decision === rule.decision,
    );
    if (exists) return cur;
    const updated: ProjectPermissions = {
      allowed: [...cur.allowed, { ...rule, addedAt: rule.addedAt ?? new Date().toISOString() }],
    };
    const path = projectPermissionsPath(cwd);
    await mkdir(join(cwd, PROJECT_PERMS_DIR), { recursive: true });
    await writeFile(path, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  });
  writeChains.set(key, next.catch(() => { /* keep chain alive */ }));
  return next;
}

export function projectRulesAsPermissionRules(p: ProjectPermissions): PermissionRule[] {
  return p.allowed.map((r) => {
    const rule: PermissionRule = { tool: r.tool, decision: r.decision };
    if (r.match !== undefined) rule.match = r.match;
    return rule;
  });
}

// Generate a match pattern from a tool name + input. The goal: the rule
// should cover similar future calls without being so broad it auto-allows
// genuinely different operations.
//
//   Bash    → match the first whitespace-separated token (the program name)
//   Edit    → match the exact file_path
//   Write   → match the exact file_path
//   Read    → match the exact file_path (read is rarely prompted, but covered)
//   default → no match (allows ANY future invocation of the same tool;
//             user can edit permissions.json manually to narrow)
export function matchPatternFor(tool: string, input: Record<string, unknown>): string | undefined {
  if (tool === 'Bash') {
    const cmd = String(input['command'] ?? '').trim();
    if (!cmd) return undefined;
    const first = cmd.split(/\s+/)[0] ?? '';
    if (!first) return undefined;
    // Anchor to start so "rm" doesn't accidentally match "trim ...".
    return `^${escapeForRegex(first)}(\\s|$)`;
  }
  if (tool === 'Edit' || tool === 'Write' || tool === 'Read' || tool === 'NotebookEdit') {
    const path = String(input['file_path'] ?? input['path'] ?? '').trim();
    if (!path) return undefined;
    return `^${escapeForRegex(path)}$`;
  }
  if (tool === 'WebFetch') {
    const url = String(input['url'] ?? '').trim();
    if (!url) return undefined;
    // Match same origin: scheme + host.
    const origin = url.match(/^https?:\/\/[^\/]+/)?.[0];
    if (!origin) return undefined;
    return `^${escapeForRegex(origin)}`;
  }
  return undefined;
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Decide whether a tool/input call should be prompted in autoAccept mode.
// Read/Glob/Grep are read-only and never prompted. Everything else prompts.
export function shouldPrompt(tool: string): boolean {
  if (tool === 'Read' || tool === 'Glob' || tool === 'Grep') return false;
  if (tool === 'TodoWrite') return false;
  if (tool === 'NotebookRead') return false;
  // AskUserQuestion drives its own modal — gating it on a separate
  // permission prompt would double-block the user and serves no purpose
  // (it has no side effect beyond rendering UI).
  if (tool === 'mcp__forge-ask__AskUserQuestion') return false;
  return true;
}
