import { MODELS, resolveModel } from '../../agent/models.js';
export function pickerAfterModelSelect(id: string): 'none' | 'thinking' {
  const provider = MODELS.find((m) => m.id === resolveModel(id))?.provider;
  return provider === 'chatgpt' ? 'thinking' : 'none';
}