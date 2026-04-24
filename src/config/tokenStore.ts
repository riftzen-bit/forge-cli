import { readFile, writeFile, unlink, chmod, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { CONFIG_DIR } from './paths.js';
import { DEFAULT_PROVIDER, type ProviderId } from '../agent/providers.js';

const TOKEN_FILENAME = '.forge-token';
const KEYS_FILENAME = 'keys.json';

function findPkgRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

export function primaryTokenPath(): string {
  return join(findPkgRoot(), TOKEN_FILENAME);
}

function fallbackTokenPath(): string {
  return join(homedir(), '.forge', TOKEN_FILENAME);
}

function keysPath(): string {
  return join(CONFIG_DIR, KEYS_FILENAME);
}

async function hideOnWindows(path: string): Promise<void> {
  if (process.platform !== 'win32') return;
  try {
    spawnSync('attrib', ['+H', path], { windowsHide: true });
  } catch {
    // best-effort
  }
}

async function readKeyStore(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(keysPath(), 'utf8');
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === 'object') {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof v === 'string' && v) out[k] = v;
      }
      return out;
    }
  } catch {
    // missing or unreadable
  }
  return {};
}

async function writeKeyStore(keys: Record<string, string>): Promise<void> {
  const path = keysPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(keys, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { await chmod(path, 0o600); } catch { /* windows best-effort */ }
  await hideOnWindows(path);
}

export async function saveToken(token: string): Promise<string> {
  const primary = primaryTokenPath();
  const candidates = [primary, fallbackTokenPath()];
  let lastErr: unknown;

  for (const path of candidates) {
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, token, { encoding: 'utf8', mode: 0o600 });
      try {
        await chmod(path, 0o600);
      } catch {
        // windows: chmod best-effort
      }
      await hideOnWindows(path);
      return path;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('failed to write token file');
}

export async function saveProviderKey(provider: ProviderId | string, key: string): Promise<void> {
  if (provider === DEFAULT_PROVIDER) {
    await saveToken(key);
    return;
  }
  const store = await readKeyStore();
  store[provider] = key;
  await writeKeyStore(store);
}

export async function loadProviderKey(provider: ProviderId | string): Promise<string | null> {
  if (provider === DEFAULT_PROVIDER) {
    return loadToken();
  }
  const envName = `FORGE_${provider.toUpperCase().replace(/-/g, '_')}_KEY`;
  const envVal = process.env[envName];
  if (envVal) return envVal;
  const store = await readKeyStore();
  return store[provider] ?? null;
}

export async function clearProviderKey(provider: ProviderId | string): Promise<void> {
  if (provider === DEFAULT_PROVIDER) {
    await clearToken();
    return;
  }
  const store = await readKeyStore();
  if (provider in store) {
    delete store[provider];
    await writeKeyStore(store);
  }
}

export async function listProviderKeys(): Promise<string[]> {
  const providers: string[] = [];
  if (await hasToken()) providers.push(DEFAULT_PROVIDER);
  const store = await readKeyStore();
  for (const id of Object.keys(store)) {
    if (id !== DEFAULT_PROVIDER) providers.push(id);
  }
  return providers;
}

export async function loadToken(): Promise<string | null> {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  for (const path of [primaryTokenPath(), fallbackTokenPath()]) {
    try {
      const raw = await readFile(path, 'utf8');
      const trimmed = raw.trim();
      if (trimmed) return trimmed;
    } catch {
      // not present here, try next
    }
  }
  return null;
}

export async function clearToken(): Promise<void> {
  for (const path of [primaryTokenPath(), fallbackTokenPath()]) {
    try {
      await unlink(path);
    } catch {
      // not present
    }
  }
}

export async function hasToken(): Promise<boolean> {
  return (await loadToken()) !== null;
}
