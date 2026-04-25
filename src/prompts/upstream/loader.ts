// Lazy loader for the Piebald-AI/claude-code-system-prompts archive
// shipped under src/prompts/upstream/. Reads the markdown bodies on demand
// and caches them in-process so the same piece never hits disk twice
// during a session. Module-level cache is fine — these files don't change
// at runtime.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Resolve the upstream directory once. Dev mode: this very file already
// lives inside src/prompts/upstream/, so HERE works directly. Built mode:
// the bundled cli.js sits in dist/, so we walk up looking for a sibling
// src/prompts/upstream/ — which package.json ships alongside dist/.
const SENTINEL = 'agent-prompt-explore.md';
let RESOLVED_DIR: string | null = null;

function resolveUpstreamDir(): string {
  if (RESOLVED_DIR) return RESOLVED_DIR;
  const candidates: string[] = [HERE];
  let cur = HERE;
  for (let i = 0; i < 6; i++) {
    candidates.push(join(cur, 'src', 'prompts', 'upstream'));
    candidates.push(join(cur, 'prompts', 'upstream'));
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  for (const dir of candidates) {
    if (existsSync(join(dir, SENTINEL))) {
      RESOLVED_DIR = resolve(dir);
      return RESOLVED_DIR;
    }
  }
  // Fall back to HERE; subsequent reads will throw a clear ENOENT.
  RESOLVED_DIR = HERE;
  return RESOLVED_DIR;
}

const cache = new Map<string, string>();

// Allowlist of upstream pieces Forge knows how to inject. Each entry maps
// a stable id → upstream basename. Adding an id here makes it loadable;
// the dynamic selector decides when each one is actually appended to the
// runtime prompt.
export const UPSTREAM_PIECES = {
  // Mode-specific
  'plan-mode-enhanced':            'agent-prompt-plan-mode-enhanced.md',
  'minimal-mode':                  'system-prompt-minimal-mode.md',

  // Subagent personas (loaded by name when a subagent of that type spawns)
  'subagent-explore':              'agent-prompt-explore.md',
  'subagent-general-purpose':      'agent-prompt-general-purpose.md',
  'subagent-verification':         'agent-prompt-verification-specialist.md',
  'subagent-webfetch':             'agent-prompt-webfetch-summarizer.md',
  'subagent-summarizer':           'agent-prompt-conversation-summarization.md',
  'subagent-claudemd-init':        'agent-prompt-claudemd-creation.md',
  'subagent-bash-desc':            'agent-prompt-bash-command-description-writer.md',
  'subagent-bash-prefix':          'agent-prompt-bash-command-prefix-detection.md',

  // Slash command personas
  'slash-commit':                  'agent-prompt-quick-git-commit.md',
  'slash-pr':                      'agent-prompt-quick-pr-creation.md',
  'slash-security-review':         'agent-prompt-security-review-slash-command.md',
  'slash-review-pr':               'agent-prompt-review-pr-slash-command.md',
  'slash-schedule':                'agent-prompt-schedule-slash-command.md',
  'slash-batch':                   'agent-prompt-batch-slash-command.md',

  // Topical pieces — promoted by the dynamic selector when context fires
  'memory-instructions':           'system-prompt-agent-memory-instructions.md',
  'subagent-delegation-examples':  'system-prompt-subagent-delegation-examples.md',
  'subagent-prompt-writing':       'system-prompt-subagent-prompt-writing-examples.md',
  'parallel-tool-call-note':       'system-prompt-parallel-tool-call-note-part-of-tool-usage-policy.md',
  'tone-and-style-code-refs':      'system-prompt-tone-and-style-code-references.md',
  'tone-and-style-concise':        'system-prompt-tone-and-style-concise-output-short.md',
  'tool-usage-task-management':    'system-prompt-tool-usage-task-management.md',
  'tool-usage-subagent-guidance':  'system-prompt-tool-usage-subagent-guidance.md',
  'partial-compaction':            'system-prompt-partial-compaction-instructions.md',
  'context-compaction-summary':    'system-prompt-context-compaction-summary.md',
  'doing-tasks-engineering':       'system-prompt-doing-tasks-software-engineering-focus.md',
  'doing-tasks-ambitious':         'system-prompt-doing-tasks-ambitious-tasks.md',
  'doing-tasks-no-compat-hacks':   'system-prompt-doing-tasks-no-compatibility-hacks.md',
  'doing-tasks-no-error-handling': 'system-prompt-doing-tasks-no-unnecessary-error-handling.md',
  'doing-tasks-security':          'system-prompt-doing-tasks-security.md',
  'doing-tasks-help-feedback':     'system-prompt-doing-tasks-help-and-feedback.md',
  'executing-actions-care':        'system-prompt-executing-actions-with-care.md',
  'communication-style':           'system-prompt-communication-style.md',
  'hooks-configuration':           'system-prompt-hooks-configuration.md',
  'tool-execution-denied':         'system-prompt-tool-execution-denied.md',
  'censoring-malicious':           'system-prompt-censoring-assistance-with-malicious-activities.md',
  'writing-subagent-prompts':      'system-prompt-writing-subagent-prompts.md',
  'fork-usage-guidelines':         'system-prompt-fork-usage-guidelines.md',
  'agent-thread-notes':            'system-prompt-agent-thread-notes.md',
  'agent-summary-generation':      'system-prompt-agent-summary-generation.md',
  'background-job-behavior':       'system-prompt-background-job-behavior.md',
  'option-previewer':              'system-prompt-option-previewer.md',
  'memory-staleness-verification': 'system-prompt-memory-staleness-verification.md',

  // Tool description pieces — keyed for selective inclusion
  'tool-readfile':                 'tool-description-readfile.md',
  'tool-write':                    'tool-description-write.md',
  'tool-edit':                     'tool-description-edit.md',
  'tool-grep':                     'tool-description-grep.md',
  'tool-bash-overview':            'tool-description-bash-overview.md',
  'tool-bash-prefer-dedicated':    'tool-description-bash-prefer-dedicated-tools.md',
  'tool-bash-parallel':            'tool-description-bash-parallel-commands.md',
  'tool-bash-sequential':          'tool-description-bash-sequential-commands.md',
  'tool-bash-cwd':                 'tool-description-bash-maintain-cwd.md',
  'tool-bash-quote-paths':         'tool-description-bash-quote-file-paths.md',
  'tool-bash-no-newlines':         'tool-description-bash-no-newlines.md',
  'tool-bash-git-new-commits':     'tool-description-bash-git-prefer-new-commits.md',
  'tool-bash-git-no-destructive':  'tool-description-bash-git-avoid-destructive-ops.md',
  'tool-bash-git-no-skip-hooks':   'tool-description-bash-git-never-skip-hooks.md',
  'tool-bash-git-commit-pr':       'tool-description-bash-git-commit-and-pr-creation-instructions.md',
  'tool-todowrite':                'tool-description-todowrite.md',
  'tool-webfetch':                 'tool-description-webfetch.md',
  'tool-websearch':                'tool-description-websearch.md',
  'tool-notebookedit':             'tool-description-notebookedit.md',
  'tool-taskcreate':               'tool-description-taskcreate.md',
  'tool-skill':                    'tool-description-skill.md',
  'tool-agent-usage-notes':        'tool-description-agent-usage-notes.md',
} as const;

export type UpstreamId = keyof typeof UPSTREAM_PIECES;

// Strip the HTML-comment metadata block the upstream corpus uses on every
// file. The block carries name/description/version/variables and is not
// meant to ship to the model. We also strip a YAML-style front-matter form
// just in case future upstream pieces switch to it.
function unwrap(raw: string): string {
  let t = raw.replace(/^﻿/, '');
  t = t.replace(/^<!--[\s\S]*?-->\s*/, '');
  t = t.replace(/^---\n[\s\S]*?\n---\n/, '');
  return t.trim();
}

export async function loadUpstream(id: UpstreamId): Promise<string> {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  const file = UPSTREAM_PIECES[id];
  if (!file) throw new Error(`unknown upstream id: ${id}`);
  try {
    const raw = await readFile(join(resolveUpstreamDir(), file), 'utf8');
    const text = unwrap(raw);
    cache.set(id, text);
    return text;
  } catch {
    // Missing on disk (older install or stripped distribution) — degrade
    // silently rather than crash the agent. Caller composes with `||`.
    cache.set(id, '');
    return '';
  }
}

export async function loadUpstreamMany(ids: ReadonlyArray<UpstreamId>): Promise<string[]> {
  const all = await Promise.all(ids.map(loadUpstream));
  return all.filter((s) => s.length > 0);
}

export function clearUpstreamCache(): void {
  cache.clear();
}
