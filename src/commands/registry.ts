export type SlashCommand = {
  name: string;
  hint: string;
  takesArg?: boolean;
  usage?: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', hint: 'show commands' },
  { name: 'model', hint: 'select model (↑/↓, Enter applies)' },
  { name: 'effort', hint: 'thinking effort (Low…X-High)' },
  { name: 'resume', hint: 'continue a past chat' },
  { name: 'parallel', hint: 'run tasks concurrently · /parallel t1 || t2', takesArg: true, usage: '<task1> || <task2> [|| ...]' },
  { name: 'plan', hint: 'toggle plan-only mode (no edits)' },
  { name: 'task', hint: 'spawn a subagent for a one-shot', takesArg: true, usage: '<task description>' },
  { name: 'todo', hint: 'todo list · /todo add|done|doing|rm|clear|list', takesArg: true, usage: 'add <text> | done <id> | doing <id> | rm <id> | clear | list' },
  { name: 'compact', hint: 'summarize history now to free context' },
  { name: 'logout', hint: 'clear stored token' },
  { name: 'clear', hint: 'clear screen' },
  { name: 'exit', hint: 'leave forge' },
  { name: 'quit', hint: 'leave forge' },
];

export function filterCommands(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return [];
  const q = input.slice(1).split(/\s+/)[0] ?? '';
  if (q === '') return SLASH_COMMANDS;
  const lower = q.toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(lower));
}

export function expand(cmd: SlashCommand): string {
  return cmd.takesArg ? `/${cmd.name} ` : `/${cmd.name}`;
}
