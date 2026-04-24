import { loadMemoryFiles } from '../memory/loader.js';

export async function runMemory(cwd: string): Promise<string> {
  const files = await loadMemoryFiles({ cwd });
  if (files.length === 0) {
    return 'no memory files found. run /init to scaffold a CLAUDE.md for this project.';
  }
  const lines: string[] = [`loaded ${files.length} memory file${files.length === 1 ? '' : 's'}:`];
  for (const f of files) {
    const len = f.content.length;
    const tag = f.type.padEnd(7);
    lines.push(`  [${tag}] ${f.path}  (${len} chars)`);
    if (f.parent) lines.push(`           via @-include from ${f.parent}`);
  }
  return lines.join('\n');
}
