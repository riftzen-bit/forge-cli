// Read-only informational commands: status, stats, cost, retry, todo.
// Each returns a formatted string that the slash dispatcher appends as a
// system message (except retry, which kicks off a resend and returns a
// short banner).

import { labelFor, contextWindowFor } from '../../../agent/models.js';
import { providerFor } from '../../../agent/providers.js';
import { authBadge } from '../../../auth/status.js';
import { formatCost } from '../../../agent/pricing.js';
import { formatTodoSummary } from '../../../agent/todos.js';
import type { CommandCtx } from './ctx.js';

export function makeHandleStatus(ctx: CommandCtx) {
  return (): string => {
    const s = ctx.sessionStatsRef.current;
    const elapsed = ((Date.now() - s.startedAt) / 1000).toFixed(1);
    const activeProvider = ctx.getActiveProvider();
    const p = providerFor(activeProvider);
    const cfg = ctx.settings?.providers?.[activeProvider] ?? {};
    const baseURL = cfg.baseURL || p.baseURL || '(default)';
    const tokens = ctx.getTokens();
    const limit = contextWindowFor(ctx.getActiveModel());
    const pct = tokens > 0 ? Math.round((tokens / limit) * 100) : 0;
    const badge = authBadge(ctx.auth);
    const mcpCount = Object.keys(ctx.settings?.mcpServers ?? {}).length;
    const ruleCount = (ctx.settings?.permissionRules ?? []).length;
    const preHooks = ctx.settings?.hooks?.preTool?.length ?? 0;
    const postHooks = ctx.settings?.hooks?.postTool?.length ?? 0;
    return [
      'session status',
      '',
      `  model:      ${labelFor(ctx.getActiveModel())}  (${ctx.getActiveModel()})`,
      `  provider:   ${p.label}  ${baseURL}`,
      `  effort:     ${ctx.getActiveEffort()}`,
      `  perm mode:  ${ctx.getPermissionMode()}`,
      `  auth:       ${badge.label}`,
      `  cwd:        ${ctx.cwd}`,
      `  elapsed:    ${elapsed}s`,
      `  turns:      ${s.turns}`,
      `  tokens:     ${tokens.toLocaleString()} / ${limit.toLocaleString()} (${pct}%)`,
      `  cost:       ${formatCost(s.totalCostUsd)}`,
      '',
      `  mcp:        ${mcpCount} server${mcpCount === 1 ? '' : 's'}`,
      `  rules:      ${ruleCount} permission rule${ruleCount === 1 ? '' : 's'}`,
      `  hooks:      ${preHooks} pre, ${postHooks} post`,
    ].join('\n');
  };
}

export function makeHandleStats(ctx: CommandCtx) {
  return (): string => {
    const s = ctx.sessionStatsRef.current;
    const elapsed = ((Date.now() - s.startedAt) / 1000).toFixed(1);
    const toolList = Object.entries(s.toolCalls)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `  ${name.padEnd(14)} ${count}`)
      .join('\n');
    return [
      `session: ${elapsed}s  turns: ${s.turns}`,
      `tokens: in ${s.totalInput.toLocaleString()}  out ${s.totalOutput.toLocaleString()}  cache-r ${s.totalCacheRead.toLocaleString()}  cache-w ${s.totalCacheWrite.toLocaleString()}`,
      `estimated cost: ${formatCost(s.totalCostUsd)}`,
      toolList ? 'tools used:\n' + toolList : 'no tools used yet',
    ].join('\n');
  };
}

export function makeHandleCost(ctx: CommandCtx) {
  return (): string => {
    const s = ctx.sessionStatsRef.current;
    if (s.totalInput + s.totalOutput === 0) return 'no usage recorded yet';
    return [
      `model: ${labelFor(ctx.getActiveModel())}  provider: ${providerFor(ctx.getActiveProvider()).label}`,
      `input:   ${s.totalInput.toLocaleString()} tok`,
      `output:  ${s.totalOutput.toLocaleString()} tok`,
      `cache-r: ${s.totalCacheRead.toLocaleString()} tok`,
      `cache-w: ${s.totalCacheWrite.toLocaleString()} tok`,
      `cost:    ${formatCost(s.totalCostUsd)}  (estimate; pricing may lag)`,
    ].join('\n');
  };
}

export function makeHandleRetry(ctx: CommandCtx) {
  return (): string => {
    // Fall back to the input history ring if we haven't captured a
    // lastUserMsg yet this session (e.g. immediately after a resume).
    const last = ctx.lastUserMsgRef.current || ctx.inputHistoryRef.current.last();
    if (!last) return 'no previous message to retry';
    void ctx.submitRef.current(last);
    return `retrying: ${last.length > 60 ? last.slice(0, 57) + '...' : last}`;
  };
}

export function makeHandleTodo(ctx: CommandCtx) {
  return (args: string): string => {
    const [sub, ...rest] = args.trim().split(/\s+/);
    const tail = rest.join(' ').trim();
    switch (sub) {
      case '':
      case 'list':
        return formatTodoSummary(ctx.todoStore.list());
      case 'add': {
        if (!tail) return 'usage: /todo add <text>';
        const td = ctx.todoStore.add(tail);
        return `added #${td.id}: ${td.text}`;
      }
      case 'done':
      case 'doing':
      case 'pending': {
        const id = Number(tail);
        if (!Number.isFinite(id)) return `usage: /todo ${sub} <id>`;
        const ok = ctx.todoStore.setStatus(id, sub as 'done' | 'doing' | 'pending');
        return ok ? `#${id} -> ${sub}` : `no todo #${id}`;
      }
      case 'rm': {
        const id = Number(tail);
        if (!Number.isFinite(id)) return 'usage: /todo rm <id>';
        return ctx.todoStore.remove(id) ? `removed #${id}` : `no todo #${id}`;
      }
      case 'clear':
        ctx.todoStore.clear();
        return 'todos cleared';
      default:
        return `unknown todo op: ${sub}`;
    }
  };
}
