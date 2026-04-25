import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { saveToken, primaryTokenPath, saveProviderKey } from '../config/tokenStore.js';
import { runSetupTokenCapture } from '../auth/setupTokenCapture.js';
import { PROVIDERS, DEFAULT_PROVIDER, providerFor, validateKey } from '../agent/providers.js';
import { saveSettings, loadSettings } from '../config/settings.js';

type LoginOpts = {
  oauth?: boolean;
  provider?: string;
};

export async function loginCommand(opts: LoginOpts = {}): Promise<void> {
  if (opts.oauth) {
    const r = await runSetupTokenCapture();
    if (!r.ok) {
      console.error(`oauth login failed: ${r.reason}`);
      process.exitCode = 1;
      return;
    }
    console.log(`token saved: ${r.path} (${r.tokenPreview})`);
    return;
  }
  if (opts.provider) {
    return providerFlow(opts.provider);
  }
  return pasteFlow();
}

function printProviderList(): void {
  output.write('\navailable providers:\n');
  for (const p of PROVIDERS) {
    const native = p.nativeAnthropic ? '' : ' (needs proxy)';
    output.write(`  ${p.id.padEnd(12)} ${p.label}${native}\n`);
  }
  output.write('\n');
}

async function providerFlow(providerId: string): Promise<void> {
  const provider = providerFor(providerId);
  if (provider.id === 'custom' && providerId !== 'custom') {
    console.error(`unknown provider: ${providerId}`);
    printProviderList();
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input, output });
  try {
    output.write(
      [
        '',
        `Forge -- login to ${provider.label}`,
        '',
        `  ${provider.hint}`,
        '',
      ].join('\n'),
    );
    if (provider.notes) output.write(`  note: ${provider.notes}\n\n`);

    let baseURL = provider.baseURL;
    if (provider.id === 'custom' || !provider.nativeAnthropic) {
      const raw = (await rl.question(
        `base URL${baseURL ? ` [${baseURL}]` : ''} > `,
      )).trim();
      if (raw) baseURL = raw;
      if (!baseURL) {
        console.error('base URL required. aborted.');
        process.exitCode = 1;
        return;
      }
    }

    const rawKey = await rl.question('paste API key > ');
    const key = rawKey.trim();
    const v = validateKey(provider, key);
    if (!v.ok) {
      console.error(v.reason);
      process.exitCode = 1;
      return;
    }

    await saveProviderKey(provider.id, key);
    const settings = await loadSettings();
    const nextProviders = { ...settings.providers };
    if (baseURL && baseURL !== provider.baseURL) {
      nextProviders[provider.id] = { ...nextProviders[provider.id], baseURL };
    }
    await saveSettings({
      activeProvider: provider.id,
      providers: nextProviders,
    });
    console.log(`saved. active provider -> ${provider.label}`);
    if (provider.id === DEFAULT_PROVIDER) {
      console.log(`token also at: ${primaryTokenPath()}`);
    }
  } finally {
    rl.close();
  }
}

async function pasteFlow(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    output.write(
      [
        '',
        'Forge -- token setup (Anthropic)',
        '',
        '  Use --provider <id> to login to another provider.',
        '  Providers: anthropic, openrouter, deepseek, zai, glm, kimi, nvidia, openai, custom.',
        '',
        '  1. Visit https://console.anthropic.com/settings/keys',
        '  2. Create or copy an API key that starts with "sk-ant-".',
        '  3. Paste it below and press Enter. The token is saved to a',
        '     hidden file under ~/.forge/.',
        '',
      ].join('\n'),
    );

    const raw = await rl.question('paste token > ');
    const token = raw.trim();

    if (!token) {
      console.error('no token provided. aborted.');
      process.exitCode = 1;
      return;
    }
    if (!token.startsWith('sk-ant-')) {
      console.error('token must start with "sk-ant-". aborted.');
      process.exitCode = 1;
      return;
    }

    const path = await saveToken(token);
    await saveSettings({ activeProvider: DEFAULT_PROVIDER });
    console.log(`token saved: ${path}`);
    console.log(`(primary target: ${primaryTokenPath()})`);
  } finally {
    rl.close();
  }
}
