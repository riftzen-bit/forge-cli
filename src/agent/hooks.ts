import { spawn } from 'node:child_process';
import type { Hook } from '../config/settings.js';

export type HookContext = {
  tool: string;
  input: Record<string, unknown>;
  cwd: string;
  phase: 'pre' | 'post';
};

function matches(hook: Hook, tool: string): boolean {
  if (hook.match === '*' || hook.match === tool) return true;
  try {
    return new RegExp(hook.match).test(tool);
  } catch {
    return false;
  }
}

export async function runHooks(hooks: Hook[], ctx: HookContext): Promise<void> {
  const applicable = hooks.filter((h) => matches(h, ctx.tool));
  await Promise.all(applicable.map((h) => runOne(h, ctx)));
}

function runOne(hook: Hook, ctx: HookContext): Promise<void> {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const flag = process.platform === 'win32' ? '/c' : '-c';
    const env = {
      ...process.env,
      FORGE_HOOK_TOOL: ctx.tool,
      FORGE_HOOK_PHASE: ctx.phase,
      FORGE_HOOK_INPUT: JSON.stringify(ctx.input),
    };
    const child = spawn(shell, [flag, hook.run], {
      cwd: ctx.cwd,
      env,
      stdio: 'ignore',
    });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}
