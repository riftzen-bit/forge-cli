import { spawn } from 'node:child_process';
import { findClaudeCodeBin } from './claudeCodeBin.js';
import { saveToken } from '../config/tokenStore.js';

export type CaptureResult =
  | { ok: true; path: string; tokenPreview: string }
  | { ok: false; reason: string };

// Claude Code's `setup-token` prints OAuth tokens beginning with `sk-ant-oat`.
// Matching that prefix avoids grabbing unrelated `sk-ant-` strings (e.g. an
// error message referring to an old API key) that may be interleaved in the
// captured output.
const TOKEN_PATTERN = /sk-ant-oat0?[A-Za-z0-9_\-]{20,}/;

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
      '----------------------------------------------------------------',
      '  launching `claude setup-token`. follow the browser prompts.',
      '  forge will capture the printed token and save it to a',
      '  hidden file inside the install directory.',
      '----------------------------------------------------------------',
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
  return { ok: true, path, tokenPreview: `${token.slice(0, 10)}...${token.slice(-4)}` };
}
