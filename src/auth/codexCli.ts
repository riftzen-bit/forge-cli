import { spawnSync } from 'node:child_process';
import { findCodexCliBin } from './codexCliBin.js';

export function hasCodexLogin(): boolean {
  const bin = findCodexCliBin();
  if (!bin) return false;
  const res = spawnSync(bin, ['login', 'status'], { stdio: 'ignore', windowsHide: true });
  return res.status === 0;
}

export function runCodexLogin(opts: { deviceAuth?: boolean } = {}): number {
  const bin = findCodexCliBin();
  if (!bin) return 1;
  const args = ['login'];
  if (opts.deviceAuth) args.push('--device-auth');
  const res = spawnSync(bin, args, { stdio: 'inherit', windowsHide: true });
  return res.status ?? 1;
}
