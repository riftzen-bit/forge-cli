export type ChatMessage =
  | { role: 'user' | 'assistant' | 'system' | 'error' | 'thinking'; text: string }
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
