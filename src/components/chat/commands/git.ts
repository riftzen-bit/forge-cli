// Plain git handlers: show a diff, plus the commit flow re-exports from
// agents.ts. /diff lives here because it does not spawn an agent, just
// shells out through the git helpers and renders the result.

import { gitDiff, isGitRepo } from '../../../agent/git.js';
import type { CommandCtx } from './ctx.js';

export function makeHandleDiff(ctx: CommandCtx) {
  return async (target: string): Promise<void> => {
    if (!(await isGitRepo(ctx.cwd))) {
      ctx.appendHistory({ role: 'error', text: 'not a git repo' });
      return;
    }
    const r = await gitDiff(ctx.cwd, target || undefined);
    if (!r.ok) {
      ctx.appendHistory({
        role: 'error',
        text: `git diff failed: ${r.stderr.trim() || r.stdout.trim()}`,
      });
      return;
    }
    const body = r.stdout.trim();
    if (!body) {
      ctx.appendHistory({ role: 'system', text: 'no unstaged changes' });
      return;
    }
    const truncated = body.length > 8000 ? body.slice(0, 8000) + '\n... (truncated)' : body;
    ctx.appendHistory({ role: 'assistant', text: '```diff\n' + truncated + '\n```' });
  };
}
