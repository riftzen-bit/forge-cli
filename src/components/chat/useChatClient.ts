// One-time construction of the long-lived chat resources: file-lock
// coordinator, parallel agent pool, spawn server, and AgentClient. These
// are created in a useState initialiser so they survive re-renders.
//
// spawnHandlersRef is the indirection that lets the spawn server's
// `onEvent` callbacks see the latest handlers after state changes — the
// client itself is frozen at first render, but handlers it delegates to
// are swapped in on every render by the caller.

import { useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { AgentClient, type ToolStartEvent, type ToolResultEvent } from '../../agent/client.js';
import { AgentPool } from '../../agent/pool.js';
import { FileCoordinator } from '../../agent/fileLocks.js';
import { createSpawnServer } from '../../agent/spawnServer.js';
import { DEFAULT_EFFORT, type Effort } from '../../agent/effort.js';
import { DEFAULT_PROVIDER } from '../../agent/providers.js';
import type { ProviderConfig, Settings } from '../../config/settings.js';
import type { ChatMessage } from '../MessageList.js';
import type { SubStats } from './useActiveTools.js';

export type SpawnHandlers = {
  onToolStart: (ev: ToolStartEvent, tag?: string) => void;
  onToolResult: (r: ToolResultEvent, tag?: string) => void;
  appendHistory: (m: ChatMessage) => void;
  getModel: () => string;
  getEffort: () => Effort;
  getProvider: () => string;
  getProviderConfig: () => ProviderConfig;
};

type Deps = {
  model: string;
  effort?: Effort;
  settings?: Settings;
  // Captured at first render; must use refs internally so they see live data.
  handleThinking: (delta: string) => void;
  pushSubDelta: (tag: string, field: 'thinking' | 'text', delta: string) => void;
  removeSubPreview: (tag: string) => void;
  subStatsRef: MutableRefObject<Map<string, SubStats>>;
};

export type ChatClientApi = {
  coordinator: FileCoordinator;
  pool: AgentPool;
  client: AgentClient;
  spawnHandlersRef: MutableRefObject<SpawnHandlers>;
};

export function useChatClient(deps: Deps): ChatClientApi {
  const { model, effort, settings, handleThinking, pushSubDelta, removeSubPreview, subStatsRef } = deps;

  const [coordinator] = useState(() => new FileCoordinator());
  const [pool] = useState(() => new AgentPool(coordinator));

  // Default handlers write nothing; ChatScreen overwrites these each render.
  const spawnHandlersRef = useRef<SpawnHandlers>({
    onToolStart: () => {},
    onToolResult: () => {},
    appendHistory: () => {},
    getModel: () => model,
    getEffort: () => effort ?? DEFAULT_EFFORT,
    getProvider: () => settings?.activeProvider ?? DEFAULT_PROVIDER,
    getProviderConfig: () => ({}),
  });

  const [client] = useState(() => {
    const spawn = createSpawnServer({
      coordinator,
      getModel: () => spawnHandlersRef.current.getModel(),
      getEffort: () => spawnHandlersRef.current.getEffort(),
      getProvider: () => spawnHandlersRef.current.getProvider(),
      getProviderConfig: () => spawnHandlersRef.current.getProviderConfig(),
      onEvent: (tag, ev) => {
        if (ev.kind === 'toolStart') {
          spawnHandlersRef.current.onToolStart(
            { id: ev.id, name: ev.tool, input: ev.input },
            tag,
          );
        } else if (ev.kind === 'toolResult') {
          spawnHandlersRef.current.onToolResult(
            { id: ev.id, ok: ev.ok, ms: ev.ms, preview: ev.preview, lines: ev.lines },
            tag,
          );
        } else if (ev.kind === 'thinking') {
          handleThinking(ev.delta);
          pushSubDelta(tag, 'thinking', ev.delta);
        } else if (ev.kind === 'text') {
          pushSubDelta(tag, 'text', ev.delta);
        } else if (ev.kind === 'done') {
          const s = subStatsRef.current.get(tag);
          subStatsRef.current.delete(tag);
          removeSubPreview(tag);
          const secs = s ? ((Date.now() - s.startedAt) / 1000).toFixed(1) : '?';
          const n = s?.count ?? 0;
          const chars = ev.reply.length;
          spawnHandlersRef.current.appendHistory({
            role: 'system',
            text: `[${tag}] done  ${n} tool${n === 1 ? '' : 's'}  ${secs}s  ${chars} chars`,
          });
        } else if (ev.kind === 'error') {
          subStatsRef.current.delete(tag);
          removeSubPreview(tag);
          spawnHandlersRef.current.appendHistory({
            role: 'error',
            text: `[${tag}] ${ev.message}`,
          });
        }
      },
    });

    const initialProvider = settings?.activeProvider ?? DEFAULT_PROVIDER;
    return new AgentClient({
      model,
      effort: effort ?? DEFAULT_EFFORT,
      locks: coordinator,
      permissionMode: settings?.permissionMode ?? 'default',
      permissionRules: settings?.permissionRules,
      hooks: settings?.hooks,
      mcpServers: { ...(settings?.mcpServers ?? {}), ...spawn.servers },
      extraAllowedTools: spawn.allowedTools,
      provider: initialProvider,
      providerConfig: settings?.providers?.[initialProvider] ?? {},
    });
  });

  return { coordinator, pool, client, spawnHandlersRef };
}
