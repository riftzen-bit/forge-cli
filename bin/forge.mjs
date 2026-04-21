#!/usr/bin/env node
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../dist/cli.js');

try {
  await import(pathToFileURL(entry).href);
} catch (err) {
  if (err?.code === 'ERR_MODULE_NOT_FOUND') {
    const src = resolve(here, '../src/cli.tsx');
    await import(pathToFileURL(src).href);
  } else {
    console.error(err);
    process.exit(1);
  }
}
