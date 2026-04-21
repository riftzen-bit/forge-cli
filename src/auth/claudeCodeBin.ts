import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const BIN_NAMES = process.platform === 'win32' ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude'];

export function findClaudeCodeBin(): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const name of BIN_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}
