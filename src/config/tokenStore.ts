import { readFile, writeFile, unlink, chmod, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const TOKEN_FILENAME = '.forge-token';

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

async function hideOnWindows(path: string): Promise<void> {
  if (process.platform !== 'win32') return;
  try {
    spawnSync('attrib', ['+H', path], { windowsHide: true });
  } catch {
    // best-effort
  }
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
