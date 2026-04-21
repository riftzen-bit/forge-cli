import { clearToken } from '../config/tokenStore.js';
import { SLASH_COMMANDS } from './registry.js';
import { parseParallelTasks } from '../agent/pool.js';

type SlashCtx = {
  onExit: () => void;
  openModelPicker: () => void;
  openEffortPicker: () => void;
  openResumePicker: () => void;
  runParallel: (tasks: string[]) => void;
  togglePlan: () => string;
  runTask: (task: string) => void;
  todo: (args: string) => string;
  compact: () => void;
};

export async function handleSlash(line: string, ctx: SlashCtx): Promise<string> {
  const raw = line.slice(1).trim();
  const [cmd] = raw.split(/\s+/);
  const rest = raw.slice((cmd ?? '').length).trim();

  switch (cmd) {
    case 'help':
      return SLASH_COMMANDS.map(
        (c) => `/${c.name.padEnd(8)} ${c.usage ?? c.hint}`,
      ).join('\n');

    case 'model':
      ctx.openModelPicker();
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
        return 'need ≥2 tasks separated by "||". e.g. /parallel read src/a.ts || read src/b.ts';
      }
      ctx.runParallel(tasks);
      return '';
    }

    case 'plan':
      return ctx.togglePlan();

    case 'task': {
      if (!rest) return 'usage: /task <description>';
      ctx.runTask(rest);
      return '';
    }

    case 'todo':
      return ctx.todo(rest);

    case 'compact':
      ctx.compact();
      return '';

    case 'logout':
      await clearToken();
      return 'token cleared';

    case 'clear':
      process.stdout.write('\x1Bc');
      return 'cleared';

    case 'exit':
    case 'quit':
      ctx.onExit();
      return 'bye';

    default:
      return `unknown: /${cmd}. try /help`;
  }
}
