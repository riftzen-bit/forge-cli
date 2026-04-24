import { spawnSync } from 'node:child_process';
import { loadSettings } from '../config/settings.js';
import { loadProviderKey, hasToken } from '../config/tokenStore.js';
import { providerFor, DEFAULT_PROVIDER } from '../agent/providers.js';
import { findClaudeCodeBin } from '../auth/claudeCodeBin.js';

function which(bin: string): string | null {
  const res = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.status !== 0) return null;
  return (res.stdout ?? '').split(/\r?\n/).find((l) => l.trim()) ?? null;
}

function version(bin: string, args: string[]): string | null {
  try {
    const res = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true });
    if (res.status !== 0) return null;
    return (res.stdout ?? '').split(/\r?\n/)[0]?.trim() || null;
  } catch {
    return null;
  }
}

export async function runDoctor(): Promise<string> {
  const lines: string[] = [];
  lines.push('forge doctor — environment diagnostics');
  lines.push('');
  lines.push(`  platform:   ${process.platform} ${process.arch}`);
  lines.push(`  node:       ${process.version}`);
  const bun = which('bun') ? version('bun', ['--version']) : null;
  lines.push(`  bun:        ${bun ?? 'not found'}`);
  const git = which('git') ? version('git', ['--version']) : null;
  lines.push(`  git:        ${git ?? 'not found'}`);
  const claude = findClaudeCodeBin();
  lines.push(`  claude bin: ${claude ?? 'not on PATH'}`);
  lines.push('');

  const settings = await loadSettings();
  const active = settings.activeProvider ?? DEFAULT_PROVIDER;
  const p = providerFor(active);
  lines.push(`  provider:   ${p.label} (${p.id})`);
  const cfg = settings.providers?.[active] ?? {};
  const baseURL = cfg.baseURL || p.baseURL || '(default)';
  lines.push(`  baseURL:    ${baseURL}`);
  lines.push(`  model:      ${settings.defaultModel}`);
  lines.push(`  effort:     ${settings.effort}`);

  const key = await loadProviderKey(active);
  if (key) {
    lines.push(`  key:        ok (${key.slice(0, 10)}...${key.slice(-4)})`);
  } else if (await hasToken()) {
    lines.push(`  key:        no ${active} key, but anthropic token is set`);
  } else {
    lines.push(`  key:        missing — run: forge login${active === DEFAULT_PROVIDER ? '' : ` --provider ${active}`}`);
  }

  lines.push('');
  const mcpCount = Object.keys(settings.mcpServers ?? {}).length;
  const ruleCount = (settings.permissionRules ?? []).length;
  const preHooks = settings.hooks?.preTool?.length ?? 0;
  const postHooks = settings.hooks?.postTool?.length ?? 0;
  lines.push(`  mcp:        ${mcpCount} server${mcpCount === 1 ? '' : 's'}`);
  lines.push(`  rules:      ${ruleCount} permission rule${ruleCount === 1 ? '' : 's'}`);
  lines.push(`  hooks:      ${preHooks} pre, ${postHooks} post`);

  return lines.join('\n');
}
