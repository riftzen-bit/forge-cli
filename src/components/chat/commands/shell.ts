// !<command> runs a single shell command in `cwd` and rewrites the most
// recent system "running: ..." message in place with the completed shell
// frame. Keeps the history tidy (no spare pending line).

import { runShell } from '../../../commands/shell.js';
import type { CommandCtx } from './ctx.js';

export function makeHandleShell(ctx: CommandCtx) {
  return async (command: string): Promise<void> => {
    ctx.appendHistory({ role: 'system', text: `running: ${command}` });
    try {
      const r = await runShell(command, ctx.cwd);
      ctx.setHistory((m) => {
        const next = m.slice();
        next[next.length - 1] = {
          role: 'shell',
          command: r.command,
          stdout: r.stdout,
          stderr: r.stderr,
          code: r.code,
          ms: r.ms,
        };
        return next;
      });
    } catch (err) {
      ctx.appendHistory({ role: 'error', text: (err as Error).message });
    }
  };
}
