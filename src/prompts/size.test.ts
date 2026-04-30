import { describe, expect, test } from 'bun:test';
import { SYSTEM_PROMPT } from './index.js';

// Rough token estimate: 4 chars per token. Same heuristic the rest of the
// codebase uses (see agent/contextBudget.ts). We assert on character count
// here so the test is deterministic across tokenizer versions.
function estTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

// Count how many times each non-trivial sentence appears across the prompt.
// We split on sentence terminators and count matches that occur more than
// once with a minimum length so rare boilerplate fragments ("for example.")
// don't flag as duplicates.
function countDuplicateSentences(prompt: string): Array<{ snippet: string; n: number }> {
  const seen = new Map<string, number>();
  const sentences = prompt
    .split(/(?<=[.!?])\s+|\n{2,}/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 60 && s.length <= 400);
  for (const s of sentences) {
    const key = s.toLowerCase().replace(/\s+/g, ' ');
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes: Array<{ snippet: string; n: number }> = [];
  for (const [k, n] of seen) {
    if (n >= 2) dupes.push({ snippet: k.slice(0, 120) + '…', n });
  }
  return dupes.sort((a, b) => b.n - a.n);
}

// Count how many times each load-bearing concept ("read before edit",
// "verify before done", …) is asserted at sentence-start. Substring match
// because the prompt rephrases the same rule in 3-5 places — which is what
// we're trying to fix.
function countConceptHits(prompt: string, needles: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const needle of needles) {
    const re = new RegExp(needle, 'gi');
    out[needle] = (prompt.match(re) ?? []).length;
  }
  return out;
}

describe('SYSTEM_PROMPT — size budget', () => {
  test('base prompt fits the new compressed budget', () => {
    const tokens = estTokens(SYSTEM_PROMPT);
    // Budget: ≤ 2800 tokens. Pre-rewrite baseline was ~7800.
    // Setting the bar at 2800 forces the rewrite to actually compress
    // and stops future contributors from re-bloating it via copy/paste.
    expect(tokens).toBeLessThan(2800);
  });

  test('does not repeat load-bearing rules more than twice each', () => {
    const hits = countConceptHits(SYSTEM_PROMPT, [
      'read.{1,30}before.{1,30}edit',
      'verify.{1,30}before.{1,30}(done|claim)',
      'minimum.viable',
      'do not.{1,30}over.?engineer',
      'mandatory verification',
    ]);
    // Each concept may appear in at most 2 places: definition + cross-link.
    for (const [needle, n] of Object.entries(hits)) {
      expect({ needle, n }).toEqual({ needle, n: expect.any(Number) });
      expect(n).toBeLessThanOrEqual(2);
    }
  });

  test('no full-sentence boilerplate is repeated across sections', () => {
    const dupes = countDuplicateSentences(SYSTEM_PROMPT);
    expect(dupes).toEqual([]);
  });
});
