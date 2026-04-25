// Context-aware extra prompt selector. Decides which upstream pieces from
// src/prompts/upstream/ should be appended to the base system prompt for
// THIS specific turn. Pieces are loaded lazily and cached, so adding more
// triggers here doesn't pay disk cost on every send().
//
// Design rule: pieces returned here are append-only — they layer on top of
// the curated BASE_PROMPT. Don't re-emit content the base already covers
// unless the upstream piece is materially more detailed for the active
// situation.

import { loadUpstreamMany, type UpstreamId } from './upstream/loader.js';
import type { Effort } from '../agent/effort.js';

export type DynamicContext = {
  // Permission mode. 'plan' triggers the enhanced plan-mode prompt.
  permissionMode?: 'default' | 'plan' | 'yolo' | 'autoAccept';
  // Effort tier. 'Low' is the smallest tier Forge exposes today and acts
  // as the trigger for the minimal-mode rules from upstream.
  effort?: Effort;
  // The latest user message. Used for keyword triggers (memory, schedule…).
  recentUserText?: string;
  // True when this prompt is being assembled for a subagent. Subagents skip
  // pieces that only make sense in the main agent loop.
  isSubagent?: boolean;
};

// Always-on extras Forge has not folded into curated TS exports yet. Light
// pieces; the cost of including them is well under a 5% bump on the base
// prompt and they encode common failure modes the curated pieces don't.
const ALWAYS_ON: readonly UpstreamId[] = [
  'parallel-tool-call-note',
  'tone-and-style-code-refs',
  'censoring-malicious',
];

// Maps a regex match against the user's most recent message → pieces to add.
// Triggers are conservative: only fire when the topic is unambiguous so we
// don't bloat unrelated turns.
const KEYWORD_TRIGGERS: ReadonlyArray<{ pattern: RegExp; ids: readonly UpstreamId[] }> = [
  // Memory / persistence work
  { pattern: /\b(memory|remember|persist|CLAUDE\.md|AGENTS\.md|skill)\b/i, ids: ['memory-instructions', 'memory-staleness-verification'] },
  // Subagent authoring / delegation
  { pattern: /\b(subagent|delegate|spawn[_ ]?agent|spawn[_ ]?parallel|parallel agents?)\b/i, ids: ['subagent-delegation-examples', 'subagent-prompt-writing', 'writing-subagent-prompts'] },
  // Hooks
  { pattern: /\b(pre[_-]?tool|post[_-]?tool|hook|hooks\.json|settings\.json)\b/i, ids: ['hooks-configuration'] },
  // Compaction
  { pattern: /\b(compact|compaction|summarize\s+(?:the\s+)?(?:context|conversation|history))\b/i, ids: ['context-compaction-summary', 'partial-compaction'] },
  // Background jobs / scheduling
  { pattern: /\b(background\s+job|cron|schedule[ds]?|recurring)\b/i, ids: ['background-job-behavior'] },
];

export async function buildDynamicExtras(ctx: DynamicContext): Promise<string> {
  const ids = new Set<UpstreamId>(ALWAYS_ON);

  if (ctx.permissionMode === 'plan') {
    ids.add('plan-mode-enhanced');
  }
  if (ctx.effort === 'Low') {
    // 'Low' is Forge's smallest effort tier; treat it as upstream's
    // "minimal mode" so output stays terse and tool calls stay scoped.
    ids.add('minimal-mode');
    ids.add('tone-and-style-concise');
  }

  if (ctx.recentUserText) {
    for (const t of KEYWORD_TRIGGERS) {
      if (t.pattern.test(ctx.recentUserText)) {
        for (const id of t.ids) ids.add(id);
      }
    }
  }

  if (ctx.isSubagent) {
    // Subagents already carry persona prompts that cover their identity.
    // Strip pieces aimed at the main agent loop.
    ids.delete('subagent-delegation-examples');
    ids.delete('subagent-prompt-writing');
    ids.delete('writing-subagent-prompts');
  }

  if (ids.size === 0) return '';
  const pieces = await loadUpstreamMany([...ids]);
  return pieces.join('\n\n');
}
