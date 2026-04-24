import { AgentClient, type StreamCallbacks } from './client.js';
import type { Effort } from './effort.js';
import type { FileCoordinator } from './fileLocks.js';
import type { ProviderConfig } from '../config/settings.js';

export type SubagentConfig = {
  model: string;
  effort: Effort;
  locks?: FileCoordinator;
  agentTag?: string;
  provider?: string;
  providerConfig?: ProviderConfig;
};

export async function runSubagent(
  task: string,
  config: SubagentConfig,
  cb: StreamCallbacks = {},
): Promise<string> {
  const opts: ConstructorParameters<typeof AgentClient>[0] = {
    model: config.model,
    effort: config.effort,
    agentTag: config.agentTag ?? 'sub',
  };
  if (config.locks) opts.locks = config.locks;
  if (config.provider) opts.provider = config.provider;
  if (config.providerConfig) opts.providerConfig = config.providerConfig;
  const client = new AgentClient(opts);
  return client.send(task, cb);
}
