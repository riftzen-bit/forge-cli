import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const FALLBACK = 'You are Forge, an interactive coding assistant. Follow the user\'s instructions carefully.';

function loadSystemPrompt(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../systemprompt.txt'),
    resolve(here, '../systemprompt.txt'),
    resolve(process.cwd(), 'systemprompt.txt'),
  ];
  for (const p of candidates) {
    try {
      const text = readFileSync(p, 'utf8').trim();
      if (text) return text;
    } catch {
      /* try next */
    }
  }
  return FALLBACK;
}

export const SYSTEM_PROMPT = loadSystemPrompt();
