import { loadSettings } from '../config/settings.js';
import { listModels } from '../agent/models.js';
import { PROVIDERS, providerFor } from '../agent/providers.js';

export async function versionCommand(): Promise<void> {
  const settings = await loadSettings();
  const p = providerFor(settings.activeProvider);
  console.log('forge 0.2.0');
  console.log(`default model:   ${settings.defaultModel}`);
  console.log(`active provider: ${p.label} (${p.id})`);
  console.log('');
  console.log('providers:');
  for (const prov of PROVIDERS) {
    const marker = prov.id === p.id ? '*' : ' ';
    const note = prov.nativeAnthropic ? '' : ' (needs proxy)';
    console.log(`  ${marker} ${prov.id.padEnd(12)} ${prov.label}${note}`);
  }
  console.log('');
  console.log('models:');
  for (const line of listModels()) console.log(`  ${line}`);
}
