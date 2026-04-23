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

// Agent SDK attaches one process "exit" listener per spawned subprocess.
// Running many parallel subagents trips Node's default 10-listener warning.
process.setMaxListeners(100);

// Multi-byte UTF-8 input (Vietnamese, CJK, emoji) can arrive split across
// stdin chunks. Without utf8 encoding, partial bytes get decoded as broken
// chars per chunk, surfacing as doubled/garbled input in raw mode.
if (process.stdin.isTTY) {
  process.stdin.setEncoding('utf8');
}

const program = new Command();

program
  .name('forge')
  .description('Forge -- terminal-native coding agent.')
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
    const releaseResize = patchInkResize();
    try {
      await instance.waitUntilExit();
    } finally {
      releaseResize();
    }
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

// Prepend a resize listener that hard-clears the terminal (scrollback +
// visible buffer) and homes the cursor BEFORE Ink's own resize handler runs.
// Ink's default handler re-emits the dynamic frame via log-update using a
// stale line count. On terminal reflow (Windows conhost / Windows Terminal)
// that leaves ghost prompt boxes stacked in scrollback. Erasing scrollback
// (\x1B[3J) prevents Windows Terminal from pushing the old viewport up into
// history. Ink's subsequent write lands on an empty screen and the erase-
// lines escape becomes a harmless no-op at row 0. Chat history remains in
// React state so the active session is unaffected; only terminal scrollback
// of older frames is sacrificed.
function patchInkResize(): () => void {
  const handler = () => {
    process.stdout.write('\x1B[H\x1B[2J\x1B[3J');
  };
  process.stdout.prependListener('resize', handler);
  return () => {
    process.stdout.off('resize', handler);
  };
}
