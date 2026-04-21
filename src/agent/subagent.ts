import { AgentClient, type StreamCallbacks } from './client.js';
import type { Effort } from './effort.js';

export type SubagentConfig = {
  model: string;
  effort: Effort;
};

export async function runSubagent(
  task: string,
  config: SubagentConfig,
  cb: StreamCallbacks = {},
): Promise<string> {
  const client = new AgentClient({
    model: config.model,
    effort: config.effort,
    agentTag: 'sub',
  });
  return client.send(task, cb);
}
