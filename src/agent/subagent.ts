import { AgentClient, type StreamCallbacks } from './client.js';
import type { Effort } from './effort.js';
import type { FileCoordinator } from './fileLocks.js';

export type SubagentConfig = {
  model: string;
  effort: Effort;
  locks?: FileCoordinator;
  agentTag?: string;
};

export async function runSubagent(
  task: string,
  config: SubagentConfig,
  cb: StreamCallbacks = {},
): Promise<string> {
  const client = new AgentClient({
    model: config.model,
    effort: config.effort,
    locks: config.locks,
    agentTag: config.agentTag ?? 'sub',
  });
  return client.send(task, cb);
}
