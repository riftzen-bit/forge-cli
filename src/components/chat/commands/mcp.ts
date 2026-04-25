// /mcp list|add|rm. Persists to settings.json AND live-applies to the
// running AgentClient via setMcpServers — the next turn picks up the
// updated server set without restarting the session.

import { saveSettings, loadSettings } from '../../../config/settings.js';
import type { CommandCtx } from './ctx.js';

export function makeHandleMcp(ctx: CommandCtx) {
  return async (args: string): Promise<string> => {
    const [sub, ...rest] = args.trim().split(/\s+/);
    switch (sub) {
      case '':
      case 'list': {
        // Read settings live so changes from this command show up.
        const settings = await loadSettings();
        const servers = settings.mcpServers ?? {};
        const keys = Object.keys(servers);
        if (keys.length === 0) return 'no MCP servers configured. add: /mcp add <name> <command> [args...]';
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
        const settings = await loadSettings();
        const current = settings.mcpServers ?? {};
        const updated = { ...current, [name]: { command, args: cmdArgs } };
        try {
          await saveSettings({ mcpServers: updated });
          // Live-apply so the next turn sees it.
          const merged = { ...ctx.client.getMcpServers(), [name]: { command, args: cmdArgs } };
          ctx.client.setMcpServers(merged);
          return `added MCP server "${name}" (live, next turn).`;
        } catch (err) {
          return `save failed: ${(err as Error).message}`;
        }
      }
      case 'rm': {
        const name = rest[0];
        if (!name) return 'usage: /mcp rm <name>';
        const settings = await loadSettings();
        const current = { ...(settings.mcpServers ?? {}) };
        if (!(name in current)) return `no MCP server "${name}"`;
        delete current[name];
        try {
          await saveSettings({ mcpServers: current });
          const merged = { ...ctx.client.getMcpServers() };
          delete merged[name];
          ctx.client.setMcpServers(merged);
          return `removed MCP server "${name}" (live).`;
        } catch (err) {
          return `save failed: ${(err as Error).message}`;
        }
      }
      default:
        return 'usage: /mcp list | add <name> <cmd> [args] | rm <name>';
    }
  };
}
