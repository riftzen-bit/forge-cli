import { spawn } from 'node:child_process';

export type GitResult = { ok: boolean; stdout: string; stderr: string; code: number };

function runGit(args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => resolve({ ok: false, stdout, stderr: String(err), code: -1 }));
    child.on('exit', (code) => resolve({ ok: code === 0, stdout, stderr, code: code ?? -1 }));
  });
}

export async function gitDiff(cwd: string, target?: string): Promise<GitResult> {
  const args = ['diff', '--no-color'];
  if (target) args.push(target);
  return runGit(args, cwd);
}

export async function gitDiffStaged(cwd: string): Promise<GitResult> {
  return runGit(['diff', '--cached', '--no-color'], cwd);
}

export async function gitStatus(cwd: string): Promise<GitResult> {
  return runGit(['status', '--short', '--branch'], cwd);
}

export async function gitCommit(cwd: string, message: string): Promise<GitResult> {
  return runGit(['commit', '-m', message], cwd);
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const r = await runGit(['rev-parse', '--git-dir'], cwd);
  return r.ok;
}
