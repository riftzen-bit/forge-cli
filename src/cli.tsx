import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { App } from './app.js';
import { loginCommand } from './commands/login.js';
import { versionCommand } from './commands/version.js';
import { configCommand } from './commands/config.js';
import { runDoctor } from './commands/doctor.js';
import { registerSetCommand } from './commands/set.js';
import { loadSettings } from './config/settings.js';
import { runSetupTokenCapture } from './auth/setupTokenCapture.js';
import { runCodexLogin } from './auth/codexCli.js';
import { handleFatal } from './utils/errors.js';
import { App as RuntimeApp } from './ui/ink/App.js';
import { pendingToolSmokeEvents, runRuntimeTurn } from './runtime/bootstrap.js';

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
  .description('Save API key for a provider.')
  .option('--oauth', 'run provider OAuth login (Anthropic or ChatGPT/Codex)')
  .option('--device-auth', 'use Codex device-code login when paired with --provider chatgpt --oauth')
  .option('--provider <id>', 'provider: anthropic | openrouter | deepseek | zai | glm | kimi | nvidia | openai | chatgpt | custom')
  .action((opts: { oauth?: boolean; provider?: string; deviceAuth?: boolean }) => loginCommand(opts));

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
  .command('doctor')
  .description('Print environment diagnostics.')
  .action(async () => {
    console.log(await runDoctor());
  });

program
  .command('runtime-smoke', { hidden: true })
  .description('Render the experimental runtime/UI vertical slice.')
  .argument('[prompt...]', 'smoke prompt words')
  .option('--tool', 'emit a pending no-op tool request')
  .action(async (words: string[], opts: { tool?: boolean }) => {
    const prompt = words.join(' ').trim() || 'Smoke test the runtime path';
    const result = await runRuntimeTurn({
      prompt,
      modelEvents: opts.tool ? pendingToolSmokeEvents() : undefined,
    });
    const instance = render(<RuntimeApp snapshot={result.state} />);
    // Yield one tick so Ink can flush stdout before unmounting the smoke UI.
    await new Promise((resolve) => setTimeout(resolve, 0));
    instance.unmount();
  });

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
  initialSettings: Awaited<ReturnType<typeof loadSettings>>,
  modelOverride?: string,
  oneShot?: string,
): Promise<void> {
  let settings = initialSettings;
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

    const latest = await loadSettings();
    if (latest.activeProvider === 'chatgpt') {
      const code = runCodexLogin();
      if (code !== 0) process.stderr.write(`\nforge: codex login failed (${code})\n`);
      else process.stdout.write('\nforge: codex session ready\n\n');
    } else {
      const r = await runSetupTokenCapture();
      if (!r.ok) {
        process.stderr.write(`\nforge: ${r.reason}\n`);
      } else {
        process.stdout.write(`\nforge: token saved (${r.tokenPreview})\n\n`);
      }
    }
    settings = await loadSettings();
    // Loop back to re-render App; detectAuth will pick up the new token/session.
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
//
// We also schedule a deferred clear-below (\x1B[J at row N+1, cursor not
// moved) on a 60ms timer — long enough for React + Ink's resize-driven
// redraw to settle. This kills the "endless black space" symptom on
// Windows Terminal where Ink draws a shorter dynamic frame than the
// previous one and leaves stale rows below.
function patchInkResize(): () => void {
  let pending: NodeJS.Timeout | undefined;
  const handler = () => {
    process.stdout.write('\x1B[H\x1B[2J\x1B[3J');
    if (pending) clearTimeout(pending);
    // 60ms is comfortably past Ink's React commit + log-update flush on
    // every terminal we tested (Windows Terminal, iTerm2, Alacritty,
    // gnome-terminal). Shorter and we race the redraw and clobber the
    // new frame; longer and the dead rows linger long enough to be
    // visible to the user before we wipe them.
    pending = setTimeout(() => {
      try { process.stdout.write('\x1B[J'); } catch { /* stdout closed */ }
      pending = undefined;
    }, 60);
  };
  process.stdout.prependListener('resize', handler);
  return () => {
    process.stdout.off('resize', handler);
    if (pending) clearTimeout(pending);
  };
}
