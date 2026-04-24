import { Command } from 'commander';
import { saveSettings, loadSettings, PERMISSION_MODES, type PermissionMode } from '../config/settings.js';
import { saveToken } from '../config/tokenStore.js';
import { resolveModel, listModels } from '../agent/models.js';
import { PROVIDERS, getProvider } from '../agent/providers.js';
import { loginCommand } from './login.js';

const TOKEN_PREFIX = 'sk-ant-';

export function registerSetCommand(program: Command): void {
  const set = program
    .command('set')
    .description('Configure Forge (model, provider, login, theme, telemetry).');

  set
    .command('model <labelOrId>')
    .description('Set default model.')
    .action(async (labelOrId: string) => {
      const resolved = resolveModel(labelOrId);
      await saveSettings({ defaultModel: resolved });
      console.log(`default model -> ${resolved}`);
      console.log('known models:');
      for (const line of listModels()) console.log(`  ${line}`);
    });

  set
    .command('provider <id>')
    .description('Set active provider (anthropic, openrouter, deepseek, zai, glm, kimi, nvidia, openai, custom).')
    .action(async (id: string) => {
      const p = getProvider(id);
      if (!p) {
        console.error(`unknown provider: ${id}`);
        console.error('known providers:');
        for (const prov of PROVIDERS) {
          console.error(`  ${prov.id.padEnd(12)} ${prov.label}`);
        }
        process.exitCode = 1;
        return;
      }
      await saveSettings({ activeProvider: p.id });
      console.log(`active provider -> ${p.label}`);
      if (!p.nativeAnthropic) {
        console.log('note: this provider needs an Anthropic-compat proxy.');
        console.log(`      forge set baseurl <url>   (default: ${p.baseURL})`);
      }
    });

  set
    .command('baseurl <url>')
    .description('Override base URL for active provider.')
    .option('-p, --provider <id>', 'provider id (defaults to active)')
    .action(async (url: string, opts: { provider?: string }) => {
      const settings = await loadSettings();
      const id = opts.provider ?? settings.activeProvider;
      const p = getProvider(id);
      if (!p) {
        console.error(`unknown provider: ${id}`);
        process.exitCode = 1;
        return;
      }
      const next = { ...settings.providers };
      next[p.id] = { ...next[p.id], baseURL: url };
      await saveSettings({ providers: next });
      console.log(`baseurl for ${p.label} -> ${url}`);
    });

  set
    .command('login [token]')
    .description('Save Anthropic API token. Prompts if omitted. Use `forge login --provider <id>` for non-Anthropic.')
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

  set
    .command('yolo <onOff>')
    .description('Skip ALL tool-call permission prompts (on|off). Persists.')
    .action(async (onOff: string) => {
      const v = onOff === 'on' || onOff === 'true';
      await saveSettings({ permissionMode: v ? 'yolo' : 'default' });
      console.log(`permission mode -> ${v ? 'yolo (all tool calls auto-approved)' : 'default'}`);
    });

  set
    .command('mode <name>')
    .description(`Set permission mode (${PERMISSION_MODES.join('|')}).`)
    .action(async (name: string) => {
      if (!(PERMISSION_MODES as readonly string[]).includes(name)) {
        console.error(`mode must be one of: ${PERMISSION_MODES.join(', ')}`);
        process.exitCode = 1;
        return;
      }
      await saveSettings({ permissionMode: name as PermissionMode });
      console.log(`permission mode -> ${name}`);
    });

  set
    .command('effort <level>')
    .description('Default reasoning effort (Low|Medium|High|X-High|Max).')
    .action(async (level: string) => {
      const valid = ['Low', 'Medium', 'High', 'X-High', 'Max'];
      if (!valid.includes(level)) {
        console.error(`effort must be one of: ${valid.join(', ')}`);
        process.exitCode = 1;
        return;
      }
      await saveSettings({ effort: level as 'Low' | 'Medium' | 'High' | 'X-High' | 'Max' });
      console.log(`effort -> ${level}`);
    });
}
