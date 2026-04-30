import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { providerFor } from '../providers.js';
import { modelsForProvider } from '../models.js';
import { buildCodexExecArgs, mapCodexJsonEvent } from './codex.js';
import { codexReasoningEffortFor } from '../thinking.js';
import { findCodexCliBin } from '../../auth/codexCliBin.js';
import { CODEX_LOGIN_STDIO } from '../../auth/codexCli.js';
import { buildCodexProcess } from '../../auth/codexProcess.js';

describe('ChatGPT/Codex provider metadata', () => {
  test('declares ChatGPT as Codex CLI session runtime', () => {
    const provider = providerFor('chatgpt');
    expect(provider.id).toBe('chatgpt');
    expect(provider.runtime).toBe('codex-cli');
    expect(provider.keyAuth).toBe(false);
    expect(provider.oauth).toBe(true);
  });

  test('keeps OpenAI API proxy distinct from ChatGPT plan auth', () => {
    expect(providerFor('openai').runtime).toBe('anthropic-sdk');
    expect(providerFor('openai').keyAuth).toBe(true);
    expect(modelsForProvider('chatgpt').map((m) => m.id)).toContain('gpt-5.5');
    expect(modelsForProvider('openai').map((m) => m.id)).toContain('gpt-4o');
  });
});

describe('Codex CLI runtime mapping', () => {
  test('does not inherit stdin for Codex login handoff', () => {
    expect(CODEX_LOGIN_STDIO).toEqual(['ignore', 'inherit', 'inherit']);
  });

  test('wraps Windows Codex shims for Node child_process', () => {
    const ps = buildCodexProcess('C:\\Users\\paul\\AppData\\Roaming\\npm\\codex.ps1', ['login', 'status']);
    expect(ps.command).toBe(process.platform === 'win32' ? 'powershell.exe' : 'C:\\Users\\paul\\AppData\\Roaming\\npm\\codex.ps1');
    const cmd = buildCodexProcess('C:\\Users\\paul\\AppData\\Roaming\\npm\\codex.cmd', ['login', 'status']);
    if (process.platform === 'win32') {
      expect(cmd.command).toBe('cmd.exe');
      expect(cmd.windowsVerbatimArguments).toBe(true);
    }
  });

  test('allows CODEX_BIN to point at a custom Codex executable', () => {
    const oldBin = process.env.CODEX_BIN;
    const dir = join(tmpdir(), `forge-codex-custom-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const bin = join(dir, process.platform === 'win32' ? 'custom-codex.cmd' : 'custom-codex');
    writeFileSync(bin, '');
    process.env.CODEX_BIN = bin;
    try {
      expect(findCodexCliBin()).toBe(bin);
    } finally {
      if (oldBin === undefined) delete process.env.CODEX_BIN;
      else process.env.CODEX_BIN = oldBin;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('finds Codex CLI on PATH before spawning', () => {
    const oldPath = process.env.PATH;
    const oldBin = process.env.CODEX_BIN;
    const dir = join(tmpdir(), `forge-codex-bin-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const binName = process.platform === 'win32' ? 'codex.cmd' : 'codex';
    const bin = join(dir, binName);
    writeFileSync(bin, '');
    process.env.PATH = dir + delimiter + (oldPath ?? '');
    delete process.env.CODEX_BIN;
    try {
      expect(findCodexCliBin()).toBe(bin);
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
      if (oldBin === undefined) delete process.env.CODEX_BIN;
      else process.env.CODEX_BIN = oldBin;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('builds exec args with json output and permission flags', () => {
    expect(buildCodexExecArgs({ model: 'gpt-5.5', prompt: 'hello', permissionMode: 'plan', cwd: '/repo' })).toEqual([
      'exec', '--json', '--model', 'gpt-5.5', '-c', 'model_reasoning_effort="medium"', '--cd', '/repo', '--sandbox', 'read-only', '-',
    ]);
    expect(buildCodexExecArgs({ model: 'gpt-5.5', prompt: 'hello', permissionMode: 'yolo', cwd: '/repo' })).toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  test('does not emit unsupported approval flags', () => {
    const args = buildCodexExecArgs({ model: 'gpt-5.5', prompt: 'hello', permissionMode: 'default', cwd: '/repo' });
    expect(args).toContain('--full-auto');
    expect(args).not.toContain('--ask-for-approval');
  });

  test('maps common JSONL events into Forge callbacks', () => {
    expect(mapCodexJsonEvent({ type: 'thread.started', thread_id: 'thread-1' })).toEqual({ kind: 'session', id: 'thread-1' });
    expect(mapCodexJsonEvent({ type: 'item.completed', item: { type: 'agent_message', text: 'Done.' } })).toEqual({ kind: 'text', text: 'Done.' });
    expect(mapCodexJsonEvent({ type: 'item.started', item: { id: 'cmd-1', type: 'command_execution', command: 'bun test' } })).toEqual({ kind: 'toolStart', id: 'cmd-1', name: 'Bash', input: { command: 'bun test' } });
    expect(mapCodexJsonEvent({ type: 'item.completed', item: { id: 'cmd-1', type: 'command_execution', status: 'completed', output: 'ok' } })).toEqual({ kind: 'toolResult', id: 'cmd-1', ok: true, preview: 'ok' });
    expect(mapCodexJsonEvent({ type: 'turn.completed', usage: { input_tokens: 3, output_tokens: 5 } })).toEqual({ kind: 'usage', usage: { input: 3, output: 5, cacheRead: 0, cacheWrite: 0 } });
    expect(mapCodexJsonEvent({ type: 'turn.failed', error: { message: 'bad auth' } })).toEqual({ kind: 'error', message: 'bad auth' });
  });
});

describe('ChatGPT thinking mapping', () => {
  test('maps UI labels to Codex reasoning effort values', () => {
    expect(codexReasoningEffortFor('Low')).toBe('low');
    expect(codexReasoningEffortFor('Medium')).toBe('medium');
    expect(codexReasoningEffortFor('High')).toBe('high');
    expect(codexReasoningEffortFor('X-High')).toBe('xhigh');
  });
});
