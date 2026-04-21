import { spawn } from 'node:child_process';
import { findClaudeCodeBin } from './claudeCodeBin.js';
import { saveToken } from '../config/tokenStore.js';

export type CaptureResult =
  | { ok: true; path: string; tokenPreview: string }
  | { ok: false; reason: string };

const TOKEN_PATTERN = /sk-ant-[A-Za-z0-9_\-]{20,}/;

export async function runSetupTokenCapture(): Promise<CaptureResult> {
  const bin = findClaudeCodeBin();
  if (!bin) {
    return {
      ok: false,
      reason: 'claude binary not on PATH. install Claude Code: https://docs.claude.com/en/docs/claude-code',
    };
  }

  process.stdout.write(
    [
      '',
      '────────────────────────────────────────────────────────────────',
      '  Launching `claude setup-token`. Follow the browser prompts.',
      '  When Claude Code prints your token, Forge will capture it',
      '  and save it to a hidden file inside the install directory.',
      '────────────────────────────────────────────────────────────────',
      '',
    ].join('\n'),
  );

  let captured = '';
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'cmd.exe' : bin;
  const args = isWin ? ['/d', '/s', '/c', `"${bin}" setup-token`] : ['setup-token'];

  const exitCode: number = await new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ['inherit', 'pipe', 'inherit'],
      windowsHide: false,
      windowsVerbatimArguments: isWin,
    });

    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);
      captured += chunk.toString('utf8');
    });

    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      process.stderr.write(`\nspawn error: ${err.message}\n`);
      resolve(1);
    });
  });

  if (exitCode !== 0) {
    return { ok: false, reason: `claude setup-token exited with code ${exitCode}` };
  }

  const match = captured.match(TOKEN_PATTERN);
  if (!match) {
    return {
      ok: false,
      reason: 'token not found in output. run `forge login` and paste it manually.',
    };
  }

  const token = match[0];
  const path = await saveToken(token);
  return { ok: true, path, tokenPreview: `${token.slice(0, 10)}…${token.slice(-4)}` };
}
