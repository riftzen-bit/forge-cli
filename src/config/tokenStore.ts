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

function findPkgRoot(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Primary is the per-user config dir so a globally-installed CLI doesn't
// write an OAuth token into a shared system directory.
export function primaryTokenPath(): string {
  return join(homedir(), '.forge', TOKEN_FILENAME);
}

// Legacy: earlier versions wrote next to the package root. Kept as a
// read/delete fallback so existing users don't lose their token on upgrade.
function legacyPkgTokenPath(): string | null {
  const root = findPkgRoot();
  return root ? join(root, TOKEN_FILENAME) : null;
}

function tokenReadCandidates(): string[] {
  const out: string[] = [primaryTokenPath()];
  const legacy = legacyPkgTokenPath();
  if (legacy) out.push(legacy);
  return out;
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
  const path = primaryTokenPath();
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
    throw err instanceof Error ? err : new Error('failed to write token file');
  }
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
  for (const path of tokenReadCandidates()) {
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

export type ClearTokenResult = {
  envVarsCleared: string[];
};

export async function clearToken(): Promise<ClearTokenResult> {
  // Also drop env-var tokens from the current process: loadToken() consults
  // them first, so without this, hasToken() keeps reporting true after a
  // "logout" whenever a token came from the environment. Note: this only
  // affects the current process — the user's shell env still holds them
  // and a fresh launch will pick them up again.
  const envVarsCleared: string[] = [];
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    envVarsCleared.push('CLAUDE_CODE_OAUTH_TOKEN');
  }
  if (process.env.ANTHROPIC_API_KEY) {
    delete process.env.ANTHROPIC_API_KEY;
    envVarsCleared.push('ANTHROPIC_API_KEY');
  }
  for (const path of tokenReadCandidates()) {
    try {
      await unlink(path);
    } catch {
      // not present
    }
  }
  return { envVarsCleared };
}

export async function hasToken(): Promise<boolean> {
  return (await loadToken()) !== null;
}
