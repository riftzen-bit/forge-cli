export type ChatMessage =
  | { role: 'user' | 'assistant' | 'system' | 'error' | 'thinking'; text: string }
  | {
      role: 'shell';
      command: string;
      stdout: string;
      stderr: string;
      code: number;
      ms: number;
    }
  | {
      role: 'tool';
      text: string;
      tool: string;
      input: Record<string, unknown>;
      id?: string;
      status?: 'run' | 'ok' | 'err';
      ms?: number;
      output?: string;
    };
