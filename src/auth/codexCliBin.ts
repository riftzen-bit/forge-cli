import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const BIN_NAMES = process.platform === 'win32' ? ['codex.cmd', 'codex', 'codex.exe'] : ['codex'];

export function findCodexCliBin(): string | null {
  const explicit = process.env.CODEX_BIN;
  if (explicit && existsSync(explicit)) return explicit;

  const dirs = (process.env.PATH ?? '').split(delimiter);
  if (process.platform === 'win32' && process.env.APPDATA) {
    dirs.push(join(process.env.APPDATA, 'npm'));
  }

  for (const entry of dirs) {
    const dir = entry.replace(/^"+|"+$/g, '');
    if (!dir) continue;
    for (const name of BIN_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}
