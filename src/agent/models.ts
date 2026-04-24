import type { ProviderId } from './providers.js';

export type ModelEntry = {
  id: string;
  label: string;
  provider: ProviderId;
  contextWindow?: number;
};

const K = 1_000;
const DEFAULT_CTX = 200 * K;
const MILLION_CTX = 1_000 * K;

export const MODELS: ModelEntry[] = [
  { id: 'claude-haiku-4-5',       label: 'Haiku 4.5',      provider: 'anthropic', contextWindow: DEFAULT_CTX },
  { id: 'claude-sonnet-4-5',      label: 'Sonnet 4.5',     provider: 'anthropic', contextWindow: DEFAULT_CTX },
  { id: 'claude-sonnet-4-6',      label: 'Sonnet 4.6',     provider: 'anthropic', contextWindow: DEFAULT_CTX },
  { id: 'claude-sonnet-4-6[1m]',  label: 'Sonnet 4.6 (1M)', provider: 'anthropic', contextWindow: MILLION_CTX },
  { id: 'claude-opus-4-7',        label: 'Opus 4.7',       provider: 'anthropic', contextWindow: DEFAULT_CTX },
  { id: 'claude-opus-4-7[1m]',    label: 'Opus 4.7 (1M)',  provider: 'anthropic', contextWindow: MILLION_CTX },

  { id: 'anthropic/claude-sonnet-4.5',      label: 'OR Sonnet 4.5',    provider: 'openrouter' },
  { id: 'anthropic/claude-opus-4.7',        label: 'OR Opus 4.7',      provider: 'openrouter' },
  { id: 'openai/gpt-4o',                    label: 'OR GPT-4o',        provider: 'openrouter' },
  { id: 'openai/gpt-4o-mini',               label: 'OR GPT-4o mini',   provider: 'openrouter' },
  { id: 'google/gemini-2.5-pro',            label: 'OR Gemini 2.5',    provider: 'openrouter', contextWindow: MILLION_CTX },
  { id: 'deepseek/deepseek-chat',           label: 'OR DeepSeek',      provider: 'openrouter' },
  { id: 'meta-llama/llama-3.1-70b-instruct', label: 'OR Llama 3.1 70B', provider: 'openrouter' },

  { id: 'deepseek-chat',      label: 'DeepSeek Chat', provider: 'deepseek' },
  { id: 'deepseek-reasoner',  label: 'DeepSeek R1',   provider: 'deepseek' },

  { id: 'glm-4.6',            label: 'GLM 4.6 (Z.ai)',      provider: 'zai' },
  { id: 'glm-4.6-flash',      label: 'GLM Flash',           provider: 'zai' },
  { id: 'glm-4.6',            label: 'GLM 4.6 (BigModel)',  provider: 'glm' },

  { id: 'kimi-k2-turbo-preview', label: 'Kimi K2 Turbo', provider: 'kimi' },
  { id: 'kimi-k2',               label: 'Kimi K2',       provider: 'kimi' },

  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'Nemotron 70B', provider: 'nvidia' },
  { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', label: 'Nemotron 253B', provider: 'nvidia' },

  { id: 'gpt-4o',      label: 'GPT-4o',      provider: 'openai' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { id: 'o1',          label: 'o1',          provider: 'openai' },
  { id: 'o3-mini',     label: 'o3-mini',     provider: 'openai' },

  { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro',   provider: 'gemini', contextWindow: MILLION_CTX },
  { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash', provider: 'gemini', contextWindow: MILLION_CTX },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Lite',  provider: 'gemini', contextWindow: MILLION_CTX },
];

export const DEFAULT_MODEL = 'claude-opus-4-7';

export function contextWindowFor(idOrLabel: string): number {
  const resolved = resolveModel(idOrLabel);
  const entry = MODELS.find((m) => m.id === resolved);
  return entry?.contextWindow ?? DEFAULT_CTX;
}

export function labelFor(id: string): string {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}

export function idFor(label: string): string {
  return MODELS.find((m) => m.label === label)?.id ?? label;
}

export function resolveModel(idOrLabel: string): string {
  const byId = MODELS.find((m) => m.id === idOrLabel);
  if (byId) return byId.id;
  const byLabel = MODELS.find((m) => m.label.toLowerCase() === idOrLabel.toLowerCase());
  if (byLabel) return byLabel.id;
  return idOrLabel;
}

export function modelsForProvider(provider: ProviderId | string): ModelEntry[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function listModels(): string[] {
  return MODELS.map((m) => `${m.label.padEnd(20)} ${m.provider.padEnd(10)} ${m.id}`);
}
