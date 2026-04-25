export type SlashCommand = {
  name: string;
  hint: string;
  takesArg?: boolean;
  usage?: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', hint: 'show commands' },
  { name: 'model', hint: 'select model (up/dn, Enter applies)' },
  { name: 'provider', hint: 'switch API provider (anthropic, openrouter, ...)' },
  { name: 'effort', hint: 'thinking effort (Low...X-High)' },
  { name: 'resume', hint: 'continue a past chat' },
  { name: 'parallel', hint: 'run tasks concurrently · /parallel t1 || t2', takesArg: true, usage: '<task1> || <task2> [|| ...]' },
  { name: 'plan', hint: 'toggle plan-only mode (no edits)' },
  { name: 'yolo', hint: 'toggle YOLO (skip all permission prompts)' },
  { name: 'autoaccept', hint: 'toggle AutoAccept (3-choice prompt before each tool call)' },
  { name: 'mode', hint: 'cycle permission mode: default -> autoAccept -> plan -> yolo' },
  { name: 'task', hint: 'spawn a subagent for a one-shot', takesArg: true, usage: '<task description>' },
  { name: 'todo', hint: 'todo list · /todo add|done|doing|rm|clear|list', takesArg: true, usage: 'add <text> | done <id> | doing <id> | rm <id> | clear | list' },
  { name: 'review', hint: 'code review via subagent', takesArg: true, usage: '[path]' },
  { name: 'review-pr', hint: 'review a GitHub PR by number via gh', takesArg: true, usage: '[number]' },
  { name: 'security-review', hint: 'adversarial security audit of current branch' },
  { name: 'explain', hint: 'explain file or range', takesArg: true, usage: '<path>[:L1-L2]' },
  { name: 'test', hint: 'run tests and summarize', takesArg: true, usage: '[pattern]' },
  { name: 'diff', hint: 'show git diff', takesArg: true, usage: '[path]' },
  { name: 'commit', hint: 'AI-generated commit for staged changes' },
  { name: 'pr', hint: 'create a GitHub PR from current branch', takesArg: true, usage: '[base-branch]' },
  { name: 'status', hint: 'full session status (model, provider, effort, ctx, rules)' },
  { name: 'stats', hint: 'session stats (tokens, tools, time)' },
  { name: 'cost', hint: 'estimated session cost' },
  { name: 'retry', hint: 'resend last user message' },
  { name: 'init', hint: 'scaffold CLAUDE.md in this project' },
  { name: 'memory', hint: 'list loaded project/user memory files' },
  { name: 'doctor', hint: 'environment diagnostics (bun, git, auth)' },
  { name: 'mcp', hint: 'list/add/rm MCP servers (live; no restart)', takesArg: true, usage: 'list | add <name> <cmd> | rm <name>' },
  { name: 'paste', hint: 'attach clipboard image to next message' },
  { name: 'login', hint: 'add/switch API key for a provider', takesArg: true, usage: '[provider]' },
  { name: 'compact', hint: 'summarize history now to free context' },
  { name: 'logout', hint: 'clear stored token' },
  { name: 'clear', hint: 'clear screen and chat history' },
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
