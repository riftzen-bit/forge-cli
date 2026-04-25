#!/usr/bin/env node
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const built = resolve(here, '../dist/cli.js');
const src = resolve(here, '../src/cli.tsx');

const hasBuilt = existsSync(built);
const hasSrc = existsSync(src);

// Pick the freshest entry. If src/ has changed since the last build (typical
// dev iteration: edit a file, re-run forge), run from source via bun so the
// user sees their changes without `bun run build` in between. If only built
// exists (npm-installed user), use it. If both exist and built is newer or
// equal, use built — it's faster to start (no transpile).
function preferSource() {
  if (!hasSrc) return false;
  if (!hasBuilt) return true;
  if (process.env.FORGE_DEV === '1') return true;
  if (process.env.FORGE_DIST === '1') return false;
  try {
    const builtMtime = statSync(built).mtimeMs;
    const srcDir = resolve(here, '../src');
    const srcMtime = newestMtimeUnder(srcDir);
    return srcMtime > builtMtime;
  } catch {
    return false;
  }
}

function newestMtimeUnder(dir) {
  // Cheap walk; src/ is small. Skips node_modules / dist by construction.
  let max = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const full = resolve(cur, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        stack.push(full);
      } else if (e.isFile()) {
        try {
          const m = statSync(full).mtimeMs;
          if (m > max) max = m;
        } catch { /* skip */ }
      }
    }
  }
  return max;
}

const useSrc = preferSource();

if (useSrc) {
  const bun = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const hasBun = spawnSync(bun, ['--version'], { stdio: 'ignore' }).status === 0;
  if (hasBun) {
    const r = spawnSync(bun, ['run', src, ...process.argv.slice(2)], { stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
  if (hasBuilt) {
    try { await import(pathToFileURL(built).href); }
    catch (err) { console.error(err); process.exit(1); }
  } else {
    console.error('forge: source detected but bun is not installed.');
    console.error('forge: install bun (https://bun.sh) or run `bun run build` to produce dist/.');
    process.exit(1);
  }
} else if (hasBuilt) {
  try { await import(pathToFileURL(built).href); }
  catch (err) { console.error(err); process.exit(1); }
} else {
  console.error('forge: entry not found (looked for ' + built + ' and ' + src + ').');
  process.exit(1);
}
