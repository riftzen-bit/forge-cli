// Fallback limits used when the caller does not know the active model's
// context window. Thresholds are model-aware via contextStateFor(total, limit).
export const CONTEXT_LIMIT = 200_000;
export const WARN_THRESHOLD = 160_000;
export const COMPACT_THRESHOLD = 180_000;

// Fractions of the active model's context window at which we warn the user
// and at which we auto-compact. Keeps behavior consistent for 1M models.
const WARN_FRACTION = 0.80;
const COMPACT_FRACTION = 0.90;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function warnThresholdFor(limit: number): number {
  return Math.floor(limit * WARN_FRACTION);
}

export function compactThresholdFor(limit: number): number {
  return Math.floor(limit * COMPACT_FRACTION);
}

export function contextStateFor(total: number, limit: number): 'ok' | 'warn' | 'compact' {
  if (total >= compactThresholdFor(limit)) return 'compact';
  if (total >= warnThresholdFor(limit)) return 'warn';
  return 'ok';
}

export function contextState(total: number): 'ok' | 'warn' | 'compact' {
  return contextStateFor(total, CONTEXT_LIMIT);
}
