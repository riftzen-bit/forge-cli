export const EFFORT_LEVELS = ['Low', 'Medium', 'High', 'Max', 'X-High'] as const;

export type Effort = (typeof EFFORT_LEVELS)[number];

export const EFFORT_BUDGET: Record<Effort, number> = {
  Low: 1024,
  Medium: 4000,
  High: 10000,
  Max: 20000,
  'X-High': 32000,
};

export const DEFAULT_EFFORT: Effort = 'Medium';

export function budgetFor(effort: Effort): number {
  return EFFORT_BUDGET[effort];
}

export function isEffort(value: string): value is Effort {
  return (EFFORT_LEVELS as readonly string[]).includes(value);
}
