// /mcp list|add|rm. Adding/removing servers writes settings but does NOT
// re-instantiate the running MCP pool — the user has to restart the
// session. We surface that in the success text.

import { saveSettings } from '../../../config/settings.js';
import type { CommandCtx } from './ctx.js';

export function makeHandleMcp(ctx: CommandCtx) {
  return async (args: string): Promise<string> => {
    const [sub, ...rest] = args.trim().split(/\s+/);
    switch (sub) {
      case '':
      case 'list': {
        const servers = ctx.settings?.mcpServers ?? {};
        const keys = Object.keys(servers);
        if (keys.length === 0) return 'no MCP servers configured';
        return keys
          .map((n) => {
            const s = servers[n]!;
            return `  ${n.padEnd(14)} ${s.command} ${(s.args ?? []).join(' ')}`;
          })
          .join('\n');
      }
      case 'add': {
        const name = rest[0];
        const command = rest[1];
        const cmdArgs = rest.slice(2);
        if (!name || !command) return 'usage: /mcp add <name> <command> [args...]';
        const current = ctx.settings?.mcpServers ?? {};
        const updated = { ...current, [name]: { command, args: cmdArgs } };
        try {
          await saveSettings({ mcpServers: updated });
          return `added MCP server "${name}". restart session to activate.`;
        } catch (err) {
          return `save failed: ${(err as Error).message}`;
        }
      }
      case 'rm': {
        const name = rest[0];
        if (!name) return 'usage: /mcp rm <name>';
        const current = { ...(ctx.settings?.mcpServers ?? {}) };
        if (!(name in current)) return `no MCP server "${name}"`;
        delete current[name];
        try {
          await saveSettings({ mcpServers: current });
          return `removed MCP server "${name}". restart session to apply.`;
        } catch (err) {
          return `save failed: ${(err as Error).message}`;
        }
      }
      default:
        return 'usage: /mcp list | add <name> <cmd> [args] | rm <name>';
    }
  };
}
