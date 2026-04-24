import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractMentionCandidates, resolveMentions, expandMentions } from './mentions.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'forge-mentions-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('extractMentionCandidates', () => {
  test('finds simple @path mentions', () => {
    expect(extractMentionCandidates('check @src/a.ts and @./README.md')).toEqual([
      'src/a.ts',
      './README.md',
    ]);
  });

  test('ignores mentions inside fenced code', () => {
    const text = '```\n@./skip.md\n```\nand @./take.md';
    expect(extractMentionCandidates(text)).toEqual(['./take.md']);
  });

  test('ignores mentions inside inline backticks', () => {
    expect(extractMentionCandidates('not `@./x.md` but @./y.md')).toEqual(['./y.md']);
  });

  test('deduplicates repeated mentions', () => {
    expect(extractMentionCandidates('@a.ts @a.ts @b.ts')).toEqual(['a.ts', 'b.ts']);
  });

  test('returns empty for text without @', () => {
    expect(extractMentionCandidates('no mentions here')).toEqual([]);
  });
});

describe('resolveMentions', () => {
  test('returns only paths that exist as files', async () => {
    await mkdir(join(tmp, 'sub'), { recursive: true });
    await writeFile(join(tmp, 'a.ts'), 'a');
    await writeFile(join(tmp, 'sub', 'b.md'), 'b');
    const out = await resolveMentions('see @a.ts @sub/b.md @missing.txt', tmp);
    const paths = out.map((m) => m.path).sort();
    expect(paths.length).toBe(2);
    expect(paths.some((p) => p.endsWith('a.ts'))).toBe(true);
    expect(paths.some((p) => p.endsWith('b.md'))).toBe(true);
  });

  test('skips directories', async () => {
    await mkdir(join(tmp, 'dir'), { recursive: true });
    const out = await resolveMentions('@dir', tmp);
    expect(out).toEqual([]);
  });
});

describe('expandMentions', () => {
  test('returns original text when no mentions resolve', async () => {
    const r = await expandMentions('plain text', tmp);
    expect(r.prompt).toBe('plain text');
    expect(r.files).toEqual([]);
  });

  test('prepends file block to prompt', async () => {
    await writeFile(join(tmp, 'a.ts'), 'hello world');
    const r = await expandMentions('explain @a.ts', tmp);
    expect(r.files.length).toBe(1);
    expect(r.prompt).toContain('<file path=');
    expect(r.prompt).toContain('hello world');
    expect(r.prompt).toContain('explain @a.ts');
  });
});
