// !<command> runs a single shell command in `cwd` and replaces the pending
// "running: ..." placeholder with the completed shell frame. We track the
// placeholder by object identity so any history entries appended during the
// await (tool events, system messages) don't get clobbered.

import type { ChatMessage } from '../../MessageList.js';
import { runShell } from '../../../commands/shell.js';
import type { CommandCtx } from './ctx.js';

export function makeHandleShell(ctx: CommandCtx) {
  return async (command: string): Promise<void> => {
    const placeholder: ChatMessage = { role: 'system', text: `running: ${command}` };
    ctx.appendHistory(placeholder);
    try {
      const r = await runShell(command, ctx.cwd);
      const frame: ChatMessage = {
        role: 'shell',
        command: r.command,
        stdout: r.stdout,
        stderr: r.stderr,
        code: r.code,
        ms: r.ms,
      };
      ctx.setHistory((m) => {
        const idx = m.indexOf(placeholder);
        if (idx === -1) return [...m, frame];
        const next = m.slice();
        next[idx] = frame;
        return next;
      });
    } catch (err) {
      ctx.setHistory((m) => {
        const idx = m.indexOf(placeholder);
        const errMsg: ChatMessage = { role: 'error', text: (err as Error).message };
        if (idx === -1) return [...m, errMsg];
        const next = m.slice();
        next[idx] = errMsg;
        return next;
      });
    }
  };
}
