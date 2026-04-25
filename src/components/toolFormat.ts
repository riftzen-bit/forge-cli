const DISPLAY_NAME: Record<string, string> = {
  Read: 'Read',
  Write: 'Write',
  Edit: 'Edit',
  NotebookRead: 'NotebookRead',
  NotebookEdit: 'NotebookEdit',
  Bash: 'Bash',
  Grep: 'Search',
  Glob: 'Find',
  WebFetch: 'Fetch',
  WebSearch: 'WebSearch',
  Task: 'Agent',
  TodoWrite: 'TodoWrite',
  spawn_agent: 'Agent',
  spawn_parallel: 'Parallel',
};

const PATH_ONLY = new Set(['Read', 'Write', 'Edit', 'NotebookRead', 'NotebookEdit']);

function stripMcp(name: string): string {
  // Non-greedy so server names containing underscores (e.g. `github_pr`) are
  // still matched; the delimiter between server and tool is the literal `__`.
  const m = name.match(/^mcp__.+?__(.+)$/);
  return m ? m[1]! : name;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 3)) + '...';
}

function toRelative(full: string, cwd: string): string {
  const root = cwd.replace(/[\\/]+$/, '');
  const norm = full.replace(/\\/g, '/');
  const rootNorm = root.replace(/\\/g, '/');
  if (norm.toLowerCase().startsWith(rootNorm.toLowerCase())) {
    const rel = norm.slice(rootNorm.length).replace(/^\/+/, '');
    return rel || '.';
  }
  const parts = norm.split('/').filter(Boolean);
  return parts.slice(-2).join('/');
}

export function baseToolName(tool: string): string {
  const stripped = tool.replace(/^\[[^\]]+\]\s*/, '').replace(/^sub\./, '');
  return stripMcp(stripped);
}

export function displayName(tool: string): string {
  const base = baseToolName(tool);
  return DISPLAY_NAME[base] ?? base;
}

export type ToolMeta = { lines?: number };

export function prettyArgs(
  tool: string,
  input: Record<string, unknown>,
  cwd: string,
  meta: ToolMeta = {},
): string {
  const base = baseToolName(tool);

  if (PATH_ONLY.has(base)) {
    const p = input['file_path'] ?? input['notebook_path'] ?? input['path'];
    if (typeof p === 'string' && p.trim()) {
      const rel = toRelative(p, cwd);
      const off = input['offset'];
      const lim = input['limit'];
      if (base === 'Write' && typeof input['content'] === 'string') {
        const lc = (input['content'] as string).split(/\r?\n/).length;
        return `${rel}  ${lc}L`;
      }
      if (typeof off === 'number' && typeof lim === 'number' && lim > 0) {
        const rangeLines = meta.lines !== undefined ? `  ${meta.lines}L` : '';
        return `${rel}  L${off}-${off + lim - 1}${rangeLines}`;
      }
      if (meta.lines !== undefined) return `${rel}  ${meta.lines}L`;
      return rel;
    }
  }

  if (base === 'Bash' && typeof input['command'] === 'string') {
    return truncate((input['command'] as string).replace(/\s+/g, ' ').trim(), 80);
  }

  if (base === 'Grep' || base === 'Glob') {
    const parts: string[] = [];
    const pat = input['pattern'];
    if (typeof pat === 'string' && pat) parts.push(`pattern: "${truncate(pat, 50)}"`);
    const glob = input['glob'];
    if (typeof glob === 'string' && glob) parts.push(`glob: "${glob}"`);
    const path = input['path'];
    if (typeof path === 'string' && path) parts.push(`path: "${toRelative(path, cwd)}"`);
    const type = input['type'];
    if (typeof type === 'string' && type) parts.push(`type: "${type}"`);
    return parts.join(', ');
  }

  if (base === 'WebFetch' && typeof input['url'] === 'string') {
    return truncate(input['url'] as string, 80);
  }

  if (base === 'WebSearch' && typeof input['query'] === 'string') {
    return `query: "${truncate(input['query'] as string, 60)}"`;
  }

  if (base === 'Task' || base === 'spawn_agent') {
    const d = input['description'] ?? input['task'] ?? input['prompt'];
    if (typeof d === 'string' && d.trim()) {
      return truncate((d as string).replace(/\s+/g, ' ').trim(), 70);
    }
  }

  if (base === 'spawn_parallel' && Array.isArray(input['tasks'])) {
    const n = (input['tasks'] as unknown[]).length;
    return `${n} subagent${n === 1 ? '' : 's'}`;
  }

  if (base === 'TodoWrite' && Array.isArray(input['todos'])) {
    const n = (input['todos'] as unknown[]).length;
    return `${n} item${n === 1 ? '' : 's'}`;
  }

  const first = Object.entries(input).find(
    ([, v]) => typeof v === 'string' && (v as string).trim(),
  );
  if (first) {
    const [k, v] = first;
    return `${k}: "${truncate(v as string, 60)}"`;
  }
  return '';
}
