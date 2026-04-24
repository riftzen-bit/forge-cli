import { spawn } from 'node:child_process';

export type ShellResult = {
  command: string;
  stdout: string;
  stderr: string;
  code: number;
  ms: number;
};

const MAX_BYTES = 64 * 1024;

function cap(s: string): string {
  if (s.length <= MAX_BYTES) return s;
  return s.slice(0, MAX_BYTES) + `\n... [+${s.length - MAX_BYTES} bytes truncated]`;
}

export function runShell(command: string, cwd: string, timeoutMs = 60_000): Promise<ShellResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const isWin = process.platform === 'win32';
    const shell = isWin ? 'cmd.exe' : '/bin/sh';
    const flag = isWin ? '/c' : '-c';
    const child = spawn(shell, [flag, command], {
      cwd,
      windowsHide: true,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        command,
        stdout: cap(stdout),
        stderr: cap(stderr || String(err)),
        code: -1,
        ms: Date.now() - startedAt,
      });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      const out = killed
        ? cap(stderr) + `\n[timed out after ${timeoutMs}ms]`
        : cap(stderr);
      resolve({
        command,
        stdout: cap(stdout),
        stderr: out,
        code: code ?? -1,
        ms: Date.now() - startedAt,
      });
    });
  });
}
