import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { AgentClient, type ToolStartEvent, type ToolResultEvent } from './client.js';
import type { FileCoordinator } from './fileLocks.js';
import type { Effort } from './effort.js';
import type { ProviderConfig } from '../config/settings.js';
import {
  EXPLORE_AGENT,
  GENERAL_PURPOSE_AGENT,
  VERIFICATION_AGENT,
} from '../prompts/index.js';

export type SpawnEvent =
  | { kind: 'toolStart'; id: string; tool: string; input: Record<string, unknown> }
  | { kind: 'toolResult'; id: string; ok: boolean; ms: number; preview?: string; lines?: number }
  | { kind: 'thinking'; delta: string }
  | { kind: 'text'; delta: string }
  | { kind: 'done'; reply: string }
  | { kind: 'error'; message: string };

type SpawnServerOpts = {
  coordinator: FileCoordinator;
  getModel: () => string;
  getEffort: () => Effort;
  getProvider?: () => string;
  getProviderConfig?: () => ProviderConfig;
  onEvent: (tag: string, ev: SpawnEvent) => void;
};

export type SpawnServerBundle = {
  servers: Record<string, unknown>;
  allowedTools: string[];
};

export function createSpawnServer(opts: SpawnServerOpts): SpawnServerBundle {
  // Per-server counter so tags stay sequential within one main agent and
  // don't interleave with siblings in a multi-server process.
  let tagCounter = 0;
  const nextTag = (): string => `sub${++tagCounter}`;

  const subagentPromptFor = (type?: string): string | undefined => {
    if (type === 'Explore' || type === 'explore') return EXPLORE_AGENT;
    if (type === 'verification' || type === 'verification-specialist') return VERIFICATION_AGENT;
    if (type === 'general-purpose' || type === undefined || type === null || type === '') return GENERAL_PURPOSE_AGENT;
    return undefined;
  };

  const runTyped = async (task: string, tag: string, subagentType?: string): Promise<string> => {
    const persona = subagentPromptFor(subagentType);
    const clientOpts: ConstructorParameters<typeof AgentClient>[0] = {
      model: opts.getModel(),
      effort: opts.getEffort(),
      locks: opts.coordinator,
      agentTag: tag,
    };
    if (opts.getProvider) clientOpts.provider = opts.getProvider();
    if (opts.getProviderConfig) clientOpts.providerConfig = opts.getProviderConfig();
    // Persona installs as the SDK system prompt (NOT as a user-message
    // prefix), so the subagent sends one persona-only system block per
    // turn instead of base-prompt + persona-as-user every call.
    if (persona) clientOpts.systemPromptOverride = persona;
    const client = new AgentClient(clientOpts);
    try {
      const reply = await client.send(task, {
        onThinking: (delta) => opts.onEvent(tag, { kind: 'thinking', delta }),
        onText: (delta) => opts.onEvent(tag, { kind: 'text', delta }),
        onToolStart: (ev: ToolStartEvent) => opts.onEvent(tag, {
          kind: 'toolStart', id: ev.id, tool: ev.name, input: ev.input,
        }),
        onToolResult: (r: ToolResultEvent) => opts.onEvent(tag, {
          kind: 'toolResult', id: r.id, ok: r.ok, ms: r.ms, preview: r.preview, lines: r.lines,
        }),
      });
      opts.onEvent(tag, { kind: 'done', reply });
      return reply;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      opts.onEvent(tag, { kind: 'error', message: msg });
      throw err;
    }
  };

  const spawnAgent = tool(
    'spawn_agent',
    'Spawn a subagent to run an independent task. The subagent shares file locks with the main agent so concurrent reads are allowed but writes are serialized. Use for focused work that can proceed without blocking the main thread, e.g. exploration, isolated fixes, research. Pass subagent_type="Explore" for read-only search agents, "verification" for adversarial verification, or omit for general-purpose.',
    {
      task: z.string().describe('Full instructions for the subagent. Be specific and self-contained.'),
      description: z.string().optional().describe('Short 3-5 word label shown in the UI.'),
      subagent_type: z.enum(['Explore', 'general-purpose', 'verification']).optional()
        .describe('Subagent persona. Explore = read-only codebase search. verification = adversarial test runner. general-purpose = default research + edit agent.'),
    },
    async (args) => {
      const tag = nextTag();
      const reply = await runTyped(args.task, tag, args.subagent_type);
      return {
        content: [{ type: 'text', text: `[${tag}] ${reply}` }],
      };
    },
  );

  const spawnParallel = tool(
    'spawn_parallel',
    'Spawn multiple subagents concurrently. Each task runs in its own AgentClient but all share the file coordinator, so no two agents will write the same file simultaneously. Returns all replies once every subagent finishes.',
    {
      tasks: z.array(z.object({
        task: z.string().describe('Full instructions for this subagent.'),
        description: z.string().optional().describe('Short label shown in the UI.'),
        subagent_type: z.enum(['Explore', 'general-purpose', 'verification']).optional()
          .describe('Subagent persona for this task.'),
      })).min(1).describe('List of independent tasks. Each spawns one concurrent subagent.'),
    },
    async (args) => {
      const results = await Promise.all(
        args.tasks.map(async (t) => {
          const tag = nextTag();
          try {
            const reply = await runTyped(t.task, tag, t.subagent_type);
            return { tag, ok: true, reply };
          } catch (err) {
            return {
              tag,
              ok: false,
              reply: err instanceof Error ? err.message : String(err),
            };
          }
        }),
      );
      const text = results
        .map((r) => `[${r.tag}] ${r.ok ? r.reply : `error: ${r.reply}`}`)
        .join('\n\n');
      return { content: [{ type: 'text', text }] };
    },
  );

  const server = createSdkMcpServer({
    name: 'forge-spawn',
    version: '1.0.0',
    tools: [spawnAgent, spawnParallel],
  });

  return {
    servers: { 'forge-spawn': server },
    allowedTools: ['mcp__forge-spawn__spawn_agent', 'mcp__forge-spawn__spawn_parallel'],
  };
}
