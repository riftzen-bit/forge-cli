export type ModelEntry = {
  id: string;
  label: string;
};

export const MODELS: ModelEntry[] = [
  { id: 'claude-haiku-4-5',  label: 'Haiku 4.5'  },
  { id: 'claude-sonnet-4-5', label: 'Sornet 4.5' },
  { id: 'claude-sonnet-4-6', label: 'Sornet 4.6' },
  { id: 'claude-opus-4-7',   label: 'Opus 4.7'   },
];

export const DEFAULT_MODEL = 'claude-opus-4-7';

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

export function listModels(): string[] {
  return MODELS.map((m) => `${m.label.padEnd(12)} ${m.id}`);
}
