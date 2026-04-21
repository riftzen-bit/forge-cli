import { loadSettings } from '../config/settings.js';
import { listModels } from '../agent/models.js';

export async function versionCommand(): Promise<void> {
  const settings = await loadSettings();
  console.log('forge 0.1.0');
  console.log(`default model: ${settings.defaultModel}`);
  console.log('available:');
  for (const line of listModels()) console.log(`  ${line}`);
}
