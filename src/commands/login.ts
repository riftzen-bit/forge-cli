import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { saveToken, primaryTokenPath } from '../config/tokenStore.js';
import { runSetupTokenCapture } from '../auth/setupTokenCapture.js';

const TOKEN_PREFIX = 'sk-ant-';

type LoginOpts = { oauth?: boolean };

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
  return pasteFlow();
}

async function pasteFlow(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    output.write(
      [
        '',
        'Forge — token setup',
        '',
        '  1. Visit https://console.anthropic.com/settings/keys',
        '  2. Create or copy an API key that starts with "sk-ant-".',
        '  3. Paste it below and press Enter. The token is saved to a',
        '     hidden file inside the Forge install directory.',
        '',
      ].join('\n'),
    );

    const raw = await rl.question('paste token ❯ ');
    const token = raw.trim();

    if (!token) {
      console.error('no token provided. aborted.');
      process.exitCode = 1;
      return;
    }
    if (!token.startsWith(TOKEN_PREFIX)) {
      console.error(`token must start with "${TOKEN_PREFIX}". aborted.`);
      process.exitCode = 1;
      return;
    }

    const path = await saveToken(token);
    console.log(`token saved: ${path}`);
    console.log(`(primary target: ${primaryTokenPath()})`);
  } finally {
    rl.close();
  }
}
