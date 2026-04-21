import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { App } from './app.js';
import { loginCommand } from './commands/login.js';
import { versionCommand } from './commands/version.js';
import { configCommand } from './commands/config.js';
import { registerSetCommand } from './commands/set.js';
import { loadSettings } from './config/settings.js';
import { runSetupTokenCapture } from './auth/setupTokenCapture.js';
import { handleFatal } from './utils/errors.js';

process.on('uncaughtException', handleFatal);
process.on('unhandledRejection', handleFatal);

const program = new Command();

program
  .name('forge')
  .description('Forge — terminal-native coding agent powered by Claude.')
  .version('0.1.0', '-v, --version');

program
  .command('login')
  .description('Save Anthropic API token to hidden file in install dir.')
  .option('--oauth', 'run `claude setup-token` and capture the printed token')
  .action((opts: { oauth?: boolean }) => loginCommand(opts));

registerSetCommand(program);

program
  .command('config')
  .description('Read or write Forge settings.')
  .option('--get <key>')
  .option('--set <kv>', 'key=value')
  .action(configCommand);

program
  .command('version')
  .description('Print Forge version and active model.')
  .action(versionCommand);

program
  .command('chat', { isDefault: true })
  .description('Start interactive coding session (default). Positional arg = one-shot prompt.')
  .argument('[prompt...]', 'one-shot prompt words; omit for interactive')
  .option('-m, --model <id>', 'override model id')
  .option('-p, --prompt <text>', 'one-shot prompt (alt to positional)')
  .action(async (words: string[], opts: { model?: string; prompt?: string }) => {
    const settings = await loadSettings();
    const positional = words.join(' ').trim();
    const oneShot = opts.prompt ?? (positional || undefined);
    await renderAppLoop(settings, opts.model, oneShot);
  });

async function renderAppLoop(
  settings: Awaited<ReturnType<typeof loadSettings>>,
  modelOverride?: string,
  oneShot?: string,
): Promise<void> {
  while (true) {
    let oauthRequested = false;
    const instance = render(
      <App
        settings={settings}
        modelOverride={modelOverride}
        oneShot={oneShot}
        onRequestOAuth={() => {
          oauthRequested = true;
          instance.unmount();
        }}
      />,
    );
    await instance.waitUntilExit();
    if (!oauthRequested) return;

    const r = await runSetupTokenCapture();
    if (!r.ok) {
      process.stderr.write(`\nforge: ${r.reason}\n`);
    } else {
      process.stdout.write(`\nforge: token saved (${r.tokenPreview})\n\n`);
    }
    // Loop back to re-render App; detectAuth will pick up the new token.
  }
}

program.parseAsync(process.argv).catch(handleFatal);
