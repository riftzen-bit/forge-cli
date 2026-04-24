#!/usr/bin/env node
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const built = resolve(here, '../dist/cli.js');
const src = resolve(here, '../src/cli.tsx');

if (existsSync(built)) {
  try {
    await import(pathToFileURL(built).href);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
} else if (existsSync(src)) {
  // Dev mode: TSX entry requires a TypeScript-capable runtime. Prefer bun
  // since the project is built with bun; fall back to a clear error so the
  // user knows to `bun run build` before `forge`.
  const bun = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const hasBun = spawnSync(bun, ['--version'], { stdio: 'ignore' }).status === 0;
  if (hasBun) {
    const r = spawnSync(bun, ['run', src, ...process.argv.slice(2)], { stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
  console.error('forge: no built entry at ' + built);
  console.error('forge: run `bun run build`, or install bun (https://bun.sh) to run from source.');
  process.exit(1);
} else {
  console.error('forge: entry not found (looked for ' + built + ' and ' + src + ').');
  process.exit(1);
}
