import { spawnSync } from 'node:child_process';
import { findCodexCliBin } from './codexCliBin.js';

export type CodexLoginResult = {
  code: number;
  error?: string;
};

export function hasCodexLogin(): boolean {
  const bin = findCodexCliBin();
  if (!bin) return false;
  const res = spawnSync(bin, ['login', 'status'], { stdio: 'ignore', windowsHide: true });
  return res.status === 0;
}

export function runCodexLogin(opts: { deviceAuth?: boolean } = {}): CodexLoginResult {
  const bin = findCodexCliBin();
  if (!bin) return { code: 1, error: 'Codex CLI not found. Install Codex CLI or set CODEX_BIN.' };
  const args = ['login'];
  if (opts.deviceAuth) args.push('--device-auth');
  const res = spawnSync(bin, args, { stdio: 'inherit', windowsHide: true });
  if (res.error) return { code: 1, error: res.error.message };
  return { code: res.status ?? 1 };
}
