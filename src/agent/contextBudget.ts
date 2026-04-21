export const CONTEXT_LIMIT = 200_000;
export const WARN_THRESHOLD = 160_000;
export const COMPACT_THRESHOLD = 180_000;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function contextState(total: number): 'ok' | 'warn' | 'compact' {
  if (total >= COMPACT_THRESHOLD) return 'compact';
  if (total >= WARN_THRESHOLD) return 'warn';
  return 'ok';
}
