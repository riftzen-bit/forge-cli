import { clearToken } from '../config/tokenStore.js';
import { SLASH_COMMANDS } from './registry.js';
import { parseParallelTasks } from '../agent/pool.js';
import { runInit } from './init.js';
import { runMemory } from './memory.js';
import { runDoctor } from './doctor.js';

type SlashCtx = {
  cwd: string;
  onExit: () => void;
  openModelPicker: () => void;
  openProviderPicker: () => void;
  openEffortPicker: () => void;
  openResumePicker: () => void;
  runParallel: (tasks: string[]) => void;
  togglePlan: () => string;
  toggleYolo: () => string;
  toggleAutoAccept: () => string;
  cyclePermissionMode: () => string;
  runTask: (task: string) => void;
  todo: (args: string) => string;
  compact: () => void;
  review: (args: string) => void;
  reviewPR: (args: string) => void;
  securityReview: () => void;
  explain: (args: string) => void;
  test: (args: string) => void;
  diff: (args: string) => void;
  commit: () => void;
  pr: (args: string) => void;
  status: () => string;
  stats: () => string;
  cost: () => string;
  retry: () => string;
  mcp: (args: string) => Promise<string>;
  paste: () => Promise<string>;
  openLoginPicker: (provider?: string) => void;
  clearScreen: () => void;
};

export async function handleSlash(line: string, ctx: SlashCtx): Promise<string> {
  const raw = line.slice(1).trim();
  const [cmd] = raw.split(/\s+/);
  const rest = raw.slice((cmd ?? '').length).trim();

  switch (cmd) {
    case 'help': {
      const rows = SLASH_COMMANDS.map((c) => `  /${c.name.padEnd(9)}  ${c.hint}`);
      return [
        'slash commands:',
        ...rows,
        '',
        'inline shortcuts:',
        '  !<cmd>      run a shell command, output appears in session',
        '  @<path>     attach file contents to your next message',
      ].join('\n');
    }

    case 'model':
      ctx.openModelPicker();
      return '';

    case 'provider':
      ctx.openProviderPicker();
      return '';

    case 'effort':
      ctx.openEffortPicker();
      return '';

    case 'resume':
      ctx.openResumePicker();
      return '';

    case 'parallel': {
      const tasks = parseParallelTasks(rest);
      if (tasks.length < 2) {
        return 'need >=2 tasks separated by "||". e.g. /parallel read src/a.ts || read src/b.ts';
      }
      ctx.runParallel(tasks);
      return '';
    }

    case 'plan':
      return ctx.togglePlan();

    case 'yolo':
      return ctx.toggleYolo();

    case 'autoaccept':
      return ctx.toggleAutoAccept();

    case 'mode':
      return ctx.cyclePermissionMode();

    case 'task': {
      if (!rest) return 'usage: /task <description>';
      ctx.runTask(rest);
      return '';
    }

    case 'todo':
      return ctx.todo(rest);

    case 'review':
      ctx.review(rest);
      return '';

    case 'review-pr':
      ctx.reviewPR(rest);
      return '';

    case 'security-review':
      ctx.securityReview();
      return '';

    case 'pr':
      ctx.pr(rest);
      return '';

    case 'explain':
      if (!rest) return 'usage: /explain <path>[:L1-L2]';
      ctx.explain(rest);
      return '';

    case 'test':
      ctx.test(rest);
      return '';

    case 'diff':
      ctx.diff(rest);
      return '';

    case 'commit':
      ctx.commit();
      return '';

    case 'status':
      return ctx.status();

    case 'stats':
      return ctx.stats();

    case 'cost':
      return ctx.cost();

    case 'retry':
      return ctx.retry();

    case 'mcp':
      return ctx.mcp(rest);

    case 'paste':
      return ctx.paste();

    case 'login': {
      ctx.openLoginPicker(rest || undefined);
      return '';
    }

    case 'compact':
      ctx.compact();
      return '';

    case 'init':
      try {
        return await runInit(ctx.cwd);
      } catch (err) {
        return `init failed: ${(err as Error).message}`;
      }

    case 'memory':
      try {
        return await runMemory(ctx.cwd);
      } catch (err) {
        return `memory failed: ${(err as Error).message}`;
      }

    case 'doctor':
      try {
        return await runDoctor();
      } catch (err) {
        return `doctor failed: ${(err as Error).message}`;
      }

    case 'logout':
      await clearToken();
      return 'token cleared';

    case 'clear':
      ctx.clearScreen();
      return '';

    case 'exit':
    case 'quit':
      ctx.onExit();
      return 'bye';

    default:
      return `unknown: /${cmd}. try /help`;
  }
}
