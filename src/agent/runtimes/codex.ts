import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { findCodexCliBin } from '../../auth/codexCliBin.js';
import type { PermissionMode } from '../../config/settings.js';
import type { StreamCallbacks, UsageDelta } from '../client.js';
import { DEFAULT_THINKING, codexReasoningEffortFor, type Thinking } from '../thinking.js';

export type CodexExecArgs = {
  model: string;
  prompt: string;
  permissionMode: PermissionMode;
  cwd: string;
  thinking?: Thinking;
};

type CodexUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
};

export type MappedCodexEvent =
  | { kind: 'session'; id: string }
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'toolStart'; id: string; name: string; input: Record<string, unknown> }
  | { kind: 'toolResult'; id: string; ok: boolean; preview?: string }
  | { kind: 'usage'; usage: UsageDelta }
  | { kind: 'error'; message: string }
  | { kind: 'ignore' };

export function buildCodexExecArgs(opts: CodexExecArgs): string[] {
  const args = [
    'exec', '--json', '--model', opts.model,
    '-c', 'model_reasoning_effort="' + codexReasoningEffortFor(opts.thinking ?? DEFAULT_THINKING) + '"',
    '--cd', opts.cwd,
  ];
  if (opts.permissionMode === 'yolo') {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  } else if (opts.permissionMode === 'plan') {
    args.push('--sandbox', 'read-only');
  } else if (opts.permissionMode === 'autoAccept') {
    args.push('--sandbox', 'workspace-write');
  } else {
    args.push('--full-auto');
  }
  args.push(opts.prompt);
  return args;
}

export function mapCodexJsonEvent(raw: unknown): MappedCodexEvent {
  const event = raw as { type?: string; thread_id?: string; item?: Record<string, unknown>; usage?: CodexUsage; error?: unknown; message?: string };
  if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
    return { kind: 'session', id: event.thread_id };
  }
  if (event.type === 'error') {
    return { kind: 'error', message: pickError(event.error) ?? event.message ?? 'codex error' };
  }
  if (event.type === 'turn.failed') {
    return { kind: 'error', message: pickError(event.error) ?? 'codex turn failed' };
  }
  if (event.type === 'turn.completed') {
    return { kind: 'usage', usage: usageDelta(event.usage) };
  }

  const item = event.item;
  if (!item) return { kind: 'ignore' };
  const itemType = String(item.type ?? '');
  const id = typeof item.id === 'string' ? item.id : itemType || 'codex-item';
  if (event.type === 'item.started' && itemType === 'command_execution') {
    const command = pickString(item.command) ?? pickString(item.cmd) ?? '';
    return { kind: 'toolStart', id, name: 'Bash', input: { command } };
  }
  if (event.type === 'item.completed' && itemType === 'command_execution') {
    const status = String(item.status ?? 'completed');
    const preview = pickString(item.output) ?? pickString(item.text) ?? pickString(item.result);
    const mapped: MappedCodexEvent = { kind: 'toolResult', id, ok: status !== 'failed' };
    if (preview !== undefined) mapped.preview = firstLine(preview);
    return mapped;
  }
  if (event.type === 'item.completed' && itemType === 'agent_message') {
    const text = pickString(item.text) ?? '';
    return text ? { kind: 'text', text } : { kind: 'ignore' };
  }
  if ((event.type === 'item.completed' || event.type === 'item.started') && itemType === 'reasoning') {
    const text = pickString(item.text) ?? pickString(item.summary) ?? '';
    return text ? { kind: 'thinking', text } : { kind: 'ignore' };
  }
  return { kind: 'ignore' };
}

export async function runCodexExec(opts: CodexExecArgs & { signal?: AbortSignal; callbacks?: StreamCallbacks }): Promise<string> {
  const args = buildCodexExecArgs(opts);
  const bin = findCodexCliBin();
  if (!bin) {
    throw new Error('Codex CLI not found. Install Codex CLI or set CODEX_BIN to its executable path.');
  }
  const child = spawn(bin, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const started = new Map<string, number>();
  let stderr = '';
  let out = '';

  const onAbort = (): void => {
    child.kill();
  };
  opts.signal?.addEventListener('abort', onAbort, { once: true });

  const consume = (async () => {
    const rl = createInterface({ input: child.stdout });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw new Error(`codex emitted malformed JSONL: ${trimmed.slice(0, 120)}`);
      }
      const mapped = mapCodexJsonEvent(parsed);
      if (mapped.kind === 'session') opts.callbacks?.onSessionId?.(mapped.id);
      else if (mapped.kind === 'text') {
        out += mapped.text;
        opts.callbacks?.onTextBlockStart?.();
        opts.callbacks?.onText?.(mapped.text);
        opts.callbacks?.onTextBlock?.(mapped.text);
      } else if (mapped.kind === 'thinking') {
        opts.callbacks?.onThinking?.(mapped.text);
        opts.callbacks?.onThinkingDone?.();
      } else if (mapped.kind === 'toolStart') {
        started.set(mapped.id, Date.now());
        opts.callbacks?.onToolStart?.({ id: mapped.id, name: mapped.name, input: mapped.input });
      } else if (mapped.kind === 'toolResult') {
        const ms = Date.now() - (started.get(mapped.id) ?? Date.now());
        started.delete(mapped.id);
        opts.callbacks?.onToolResult?.({ id: mapped.id, ok: mapped.ok, ms, preview: mapped.preview });
      } else if (mapped.kind === 'usage') {
        opts.callbacks?.onUsage?.(mapped.usage);
        const total = mapped.usage.input + mapped.usage.cacheRead + mapped.usage.cacheWrite;
        if (total > 0) opts.callbacks?.onTokens?.(total);
      } else if (mapped.kind === 'error') {
        throw new Error(mapped.message);
      }
    }
  })();

  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  opts.signal?.removeEventListener('abort', onAbort);
  await consume;
  if (opts.signal?.aborted) return '';
  if (exitCode !== 0) {
    const msg = stderr.trim() || `codex exec failed with exit code ${exitCode}`;
    throw new Error(msg);
  }
  return out.trim();
}


function usageDelta(usage: CodexUsage | undefined): UsageDelta {
  return {
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
    cacheRead: usage?.cached_input_tokens ?? 0,
    cacheWrite: 0,
  };
}

function pickError(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const msg = (value as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return undefined;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function firstLine(s: string): string {
  const trimmed = s.trim();
  const nl = trimmed.indexOf('\n');
  const line = nl >= 0 ? trimmed.slice(0, nl) : trimmed;
  return line.length > 100 ? line.slice(0, 99) + '...' : line;
}
