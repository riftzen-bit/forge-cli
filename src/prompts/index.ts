// Composer. Assembles the runtime system prompt from modular pieces.
//
// Architecture — three layers of prompt content:
//
// 1. BASE SYSTEM PROMPT (always present, ~4k tokens):
//    identity, security, thinking, system notes, doing-tasks, executing,
//    tool general guidance, tone/style. Composed once per agent turn.
//
// 2. FEATURE PIECES (conditionally appended to system prompt):
//    e.g. PLAN_MODE when planMode=true. Driven by PromptContext.
//
// 3. TASK PROMPTS / SUBAGENT PERSONAS (not system prompt — go into the
//    user-turn content or the subagent's first message):
//    - src/prompts/commands/* for slash commands (/commit, /review, etc.)
//    - src/prompts/agents.ts for subagent personas
//    - PARTIAL_COMPACTION for /compact
//
// This matches the Claude Code upstream pattern: the main prompt stays
// stable, and situational pieces are loaded only when the situation fires.

import { loadMemoryFiles, formatMemoryPrompt } from '../memory/loader.js';
import { loadSkillIndex, formatSkillIndex } from '../memory/skills.js';
import {
  CORE_IDENTITY,
  SECURITY_HEADER,
  WORKING_DIRECTORY_OWNERSHIP,
  DESIGN_TASTE,
  THINK_FIRST,
  SYSTEM_NOTES,
  TOOL_EXECUTION_DENIED,
  SUBAGENT_GUIDANCE,
} from './core.js';
import { DOING_TASKS } from './doing.js';
import { EXECUTING_ACTIONS } from './executing.js';
import { ALL_TOOLS } from './tools.js';
import { ALL_STYLE } from './style.js';
import { PLAN_MODE } from './features/plan-mode.js';
import {
  NO_LAZINESS,
  READ_BEFORE_ACT,
  MANDATORY_VERIFICATION,
  FOLLOW_AGENTS_MD,
} from './verification.js';
import { buildDynamicExtras, type DynamicContext } from './dynamic.js';
import type { Effort } from '../agent/effort.js';

export type PromptContext = {
  planMode?: boolean;
  // Effort tier from the active client. 'Low' triggers minimal-mode
  // because that's the smallest effort Forge exposes today.
  effort?: Effort;
  // Latest user message — used by the dynamic selector for keyword
  // triggers (memory, hooks, scheduling, …). Optional.
  recentUserText?: string;
  // True when assembling for a subagent client. Strips main-agent-only
  // pieces from the dynamic extras.
  isSubagent?: boolean;
};

// Always-on base. Assembled once at module load — cheap.
const BASE_PROMPT = [
  CORE_IDENTITY,
  '',
  NO_LAZINESS,
  '',
  THINK_FIRST,
  '',
  SECURITY_HEADER,
  '',
  WORKING_DIRECTORY_OWNERSHIP,
  '',
  SYSTEM_NOTES,
  '',
  READ_BEFORE_ACT,
  '',
  DOING_TASKS,
  '',
  EXECUTING_ACTIONS,
  '',
  MANDATORY_VERIFICATION,
  '',
  ALL_TOOLS,
  '',
  SUBAGENT_GUIDANCE,
  '',
  TOOL_EXECUTION_DENIED,
  '',
  FOLLOW_AGENTS_MD,
  '',
  ALL_STYLE,
  '',
  DESIGN_TASTE,
].join('\n');

// Legacy alias — callers importing SYSTEM_PROMPT get the base (plan mode
// off). Prefer buildSystemPrompt(cwd, ctx) for new code.
export const SYSTEM_PROMPT = BASE_PROMPT;

export async function buildSystemPrompt(
  cwd: string = process.cwd(),
  ctx: PromptContext = {},
): Promise<string> {
  const parts: string[] = [BASE_PROMPT];

  if (ctx.planMode) {
    parts.push('', PLAN_MODE);
  }

  const dyn: DynamicContext = {
    permissionMode: ctx.planMode ? 'plan' : 'default',
  };
  if (ctx.effort) dyn.effort = ctx.effort;
  if (ctx.recentUserText) dyn.recentUserText = ctx.recentUserText;
  if (ctx.isSubagent) dyn.isSubagent = ctx.isSubagent;
  const extras = await buildDynamicExtras(dyn);
  if (extras) {
    parts.push('', '# Situational guidance', '', extras);
  }

  const skills = await loadSkillIndex({ cwd });
  const skillBlock = formatSkillIndex(skills);
  if (skillBlock) {
    parts.push('', skillBlock);
  }

  const files = await loadMemoryFiles({ cwd });
  const memoryBlock = formatMemoryPrompt(files);
  if (memoryBlock) {
    parts.push('', '# Project and user instructions', '', memoryBlock);
  }

  return parts.join('\n');
}

// Compose a subagent system prompt: persona on top, then a slim baseline
// (so the subagent inherits read-before-edit, code-quality, executing-care
// rules), then the project + user memory and skill index. Without this, a
// subagent is a stateless box that only sees the persona — no AGENTS.md, no
// CLAUDE.md, no skills — and routinely refuses or guesses when the task
// references project conventions it can't see.
export async function buildSubagentPrompt(
  persona: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const parts: string[] = [persona];
  parts.push('', SUBAGENT_BASELINE);
  const skills = await loadSkillIndex({ cwd });
  const skillBlock = formatSkillIndex(skills);
  if (skillBlock) parts.push('', skillBlock);
  const files = await loadMemoryFiles({ cwd });
  const memoryBlock = formatMemoryPrompt(files);
  if (memoryBlock) {
    parts.push('', '# Project and user instructions', '', memoryBlock);
  }
  return parts.join('\n');
}

// Slim version of the main agent's discipline rules. Subagents already have
// a focused persona; we only need to back-stop them with the universal
// "don't add error handling for impossible scenarios", "Read before Edit",
// "verify before claiming done", "follow AGENTS.md" rules.
const SUBAGENT_BASELINE = `# Baseline rules (apply on every turn)

- Treat the persona above as your role. The rules below are constraints, not your identity.
- Read every file before editing it. Edits to un-Read files are rejected by the sandbox.
- Default to the smallest correct change. Don't refactor adjacent code, don't add speculative options, don't add error handling for scenarios that can't happen.
- Don't claim "done" without running available checks (typecheck / tests / lint / build) and reading their output. If a check can't be run, say so explicitly.
- Follow every rule in the project / user instructions block at the bottom of this prompt. Those override your defaults.
- If a skill listed above clearly applies, Read its SKILL.md and follow it. Don't try to reconstruct the skill from the catalog description.
- If the task is genuinely impossible or unsafe, say so plainly with a one-line reason. Don't refuse out of generic caution when the task is normal coding work.`;

// Subagent personas — loaded when a subagent of that type is spawned.
export {
  EXPLORE_AGENT,
  GENERAL_PURPOSE_AGENT,
  VERIFICATION_AGENT,
  CONVERSATION_SUMMARY_AGENT,
  PARTIAL_COMPACTION,
} from './agents.js';

// Slash-command task prompts — injected into the user message when the
// matching slash command fires.
export {
  commitTaskPrompt,
  reviewTaskPrompt,
  reviewPRTaskPrompt,
  securityReviewTaskPrompt,
  prTaskPrompt,
  explainTaskPrompt,
  testTaskPrompt,
} from './commands/index.js';
