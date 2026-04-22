import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadMemoryFiles, formatMemoryPrompt } from '../memory/loader.js';

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

export async function buildSystemPrompt(cwd: string = process.cwd()): Promise<string> {
  const files = await loadMemoryFiles({ cwd });
  const memoryBlock = formatMemoryPrompt(files);
  if (!memoryBlock) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n\n# Project and user instructions\n\n${memoryBlock}`;
}
