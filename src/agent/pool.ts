import { AgentClient } from './client.js';
import { FileLockManager } from './fileLocks.js';
import type { Effort } from './effort.js';

export type PoolEvent =
  | { kind: 'thinking'; delta: string }
  | { kind: 'text'; delta: string }
  | { kind: 'tool'; tool: string; input: Record<string, unknown> }
  | { kind: 'done'; reply: string }
  | { kind: 'error'; message: string };

export type PoolConfig = {
  model: string;
  effort: Effort;
};

export type PoolResult = { index: number; tag: string; reply?: string; error?: string };

export class AgentPool {
  private locks = new FileLockManager();

  async runParallel(
    tasks: string[],
    config: PoolConfig,
    onEvent: (index: number, tag: string, ev: PoolEvent) => void,
  ): Promise<PoolResult[]> {
    const jobs = tasks.map((task, i) => {
      const tag = `A${i + 1}`;
      const client = new AgentClient({
        model: config.model,
        effort: config.effort,
        locks: this.locks,
        agentTag: tag,
      });
      return client
        .send(task, {
          onThinking: (delta) => onEvent(i, tag, { kind: 'thinking', delta }),
          onText: (delta) => onEvent(i, tag, { kind: 'text', delta }),
          onTool: (t) => onEvent(i, tag, { kind: 'tool', tool: t.name, input: t.input }),
        })
        .then<PoolResult>((reply) => {
          onEvent(i, tag, { kind: 'done', reply });
          return { index: i, tag, reply };
        })
        .catch<PoolResult>((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          onEvent(i, tag, { kind: 'error', message });
          return { index: i, tag, error: message };
        });
    });
    return Promise.all(jobs);
  }
}

export function parseParallelTasks(line: string): string[] {
  return line
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean);
}
