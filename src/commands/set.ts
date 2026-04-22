import { Command } from 'commander';
import { saveSettings } from '../config/settings.js';
import { saveToken } from '../config/tokenStore.js';
import { resolveModel, listModels } from '../agent/models.js';
import { loginCommand } from './login.js';

const TOKEN_PREFIX = 'sk-ant-';

export function registerSetCommand(program: Command): void {
  const set = program
    .command('set')
    .description('Configure Forge (model, login, theme, telemetry).');

  set
    .command('model <labelOrId>')
    .description('Set default Claude model (Haiku 4.5 | Sornet 4.5 | Sornet 4.6 | Opus 4.7).')
    .action(async (labelOrId: string) => {
      const resolved = resolveModel(labelOrId);
      await saveSettings({ defaultModel: resolved });
      console.log(`default model -> ${resolved}`);
      console.log('known models:');
      for (const line of listModels()) console.log(`  ${line}`);
    });

  set
    .command('login [token]')
    .description('Save Anthropic API token. Prompts if omitted.')
    .action(async (token?: string) => {
      if (!token) return loginCommand();
      if (!token.startsWith(TOKEN_PREFIX)) {
        console.error(`token must start with "${TOKEN_PREFIX}". aborted.`);
        process.exitCode = 1;
        return;
      }
      const path = await saveToken(token);
      console.log(`token saved: ${path}`);
    });

  set
    .command('theme <mode>')
    .description('Set UI theme (dark|light).')
    .action(async (mode: string) => {
      if (mode !== 'dark' && mode !== 'light') {
        console.error('theme must be dark or light');
        process.exitCode = 1;
        return;
      }
      await saveSettings({ theme: mode });
      console.log(`theme -> ${mode}`);
    });

  set
    .command('telemetry <onOff>')
    .description('Enable or disable telemetry (on|off).')
    .action(async (onOff: string) => {
      const v = onOff === 'on' || onOff === 'true';
      await saveSettings({ telemetry: v });
      console.log(`telemetry -> ${v ? 'on' : 'off'}`);
    });
}
