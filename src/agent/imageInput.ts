// Detects pasted "data:image/...;base64,..." URLs in user input, decodes
// them to disk, and returns the rewritten prompt + a list of saved paths.
// Used by the chat submit flow so users can paste an image-as-data-URL
// directly into the prompt and have it saved + referenced as a file path.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DATA_URL_RE = /data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)/g;

function clipDir(): string {
  return join(homedir(), '.forge', 'clip');
}

export async function extractDataUrlImages(text: string): Promise<{ text: string; saved: string[] }> {
  const matches: { full: string; mime: string; b64: string }[] = [];
  for (const m of text.matchAll(DATA_URL_RE)) {
    matches.push({ full: m[0], mime: m[1]!, b64: m[2]! });
  }
  if (matches.length === 0) return { text, saved: [] };
  await mkdir(clipDir(), { recursive: true });
  const saved: string[] = [];
  let rewritten = text;
  let i = 0;
  for (const m of matches) {
    const ext = m.mime === 'jpg' ? 'jpeg' : m.mime;
    const out = join(clipDir(), `paste-${Date.now()}-${i++}.${ext}`);
    try {
      await writeFile(out, Buffer.from(m.b64, 'base64'));
      saved.push(out);
      rewritten = rewritten.replace(m.full, `[image: ${out}]`);
    } catch {
      // skip on write failure
    }
  }
  return { text: rewritten, saved };
}
