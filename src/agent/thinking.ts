export const THINKING_LEVELS = ['Low', 'Medium', 'High', 'X-High'] as const;

export type Thinking = (typeof THINKING_LEVELS)[number];

export const DEFAULT_THINKING: Thinking = 'Medium';

const CODEX_REASONING_EFFORT: Record<Thinking, 'low' | 'medium' | 'high' | 'xhigh'> = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  'X-High': 'xhigh',
};

export function codexReasoningEffortFor(thinking: Thinking): string {
  return CODEX_REASONING_EFFORT[thinking];
}

export function isThinking(value: string): value is Thinking {
  return (THINKING_LEVELS as readonly string[]).includes(value);
}