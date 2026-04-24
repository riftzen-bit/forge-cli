export type ModelPrice = {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok?: number;
  cacheWritePerMTok?: number;
};

export const PRICING: Record<string, ModelPrice> = {
  'claude-opus-4-7':      { inputPerMTok: 15.00, outputPerMTok: 75.00, cacheReadPerMTok: 1.50, cacheWritePerMTok: 18.75 },
  'claude-sonnet-4-6':    { inputPerMTok:  3.00, outputPerMTok: 15.00, cacheReadPerMTok: 0.30, cacheWritePerMTok:  3.75 },
  'claude-sonnet-4-5':    { inputPerMTok:  3.00, outputPerMTok: 15.00, cacheReadPerMTok: 0.30, cacheWritePerMTok:  3.75 },
  'claude-haiku-4-5':     { inputPerMTok:  1.00, outputPerMTok:  5.00, cacheReadPerMTok: 0.10, cacheWritePerMTok:  1.25 },

  'gpt-4o':               { inputPerMTok:  2.50, outputPerMTok: 10.00 },
  'gpt-4o-mini':          { inputPerMTok:  0.15, outputPerMTok:  0.60 },
  'o1':                   { inputPerMTok: 15.00, outputPerMTok: 60.00 },
  'o3-mini':              { inputPerMTok:  1.10, outputPerMTok:  4.40 },

  'deepseek-chat':        { inputPerMTok:  0.27, outputPerMTok:  1.10 },
  'deepseek-reasoner':    { inputPerMTok:  0.55, outputPerMTok:  2.19 },

  'glm-4.6':              { inputPerMTok:  0.60, outputPerMTok:  2.20 },
  'glm-4.6-flash':        { inputPerMTok:  0.10, outputPerMTok:  0.30 },

  'kimi-k2':              { inputPerMTok:  0.60, outputPerMTok:  2.50 },
  'kimi-k2-turbo-preview': { inputPerMTok:  0.60, outputPerMTok:  2.50 },
};

export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export function estimateCost(model: string, usage: Usage): number {
  const p = PRICING[model] ?? PRICING[stripProviderPrefix(model)];
  if (!p) return 0;
  const mt = 1_000_000;
  const base =
    (usage.input / mt) * p.inputPerMTok +
    (usage.output / mt) * p.outputPerMTok;
  const cr = p.cacheReadPerMTok ?? p.inputPerMTok;
  const cw = p.cacheWritePerMTok ?? p.inputPerMTok;
  const cache =
    (usage.cacheRead / mt) * cr +
    (usage.cacheWrite / mt) * cw;
  return base + cache;
}

function stripProviderPrefix(id: string): string {
  const slash = id.indexOf('/');
  return slash >= 0 ? id.slice(slash + 1) : id;
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
