import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  loadMemoryFiles,
  formatMemoryPrompt,
  extractIncludes,
  stripFencedCodeForTest,
} from './loader.js';

let tmp: string;
let home: string;
let project: string;
let nested: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'forge-mem-'));
  home = join(tmp, 'home');
  project = join(tmp, 'proj');
  nested = join(project, 'sub', 'deep');
  await mkdir(join(home, '.claude'), { recursive: true });
  await mkdir(join(home, '.forge'), { recursive: true });
  await mkdir(nested, { recursive: true });
  await mkdir(join(project, '.claude'), { recursive: true });
  await mkdir(join(project, '.git'), { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('loadMemoryFiles', () => {
  test('returns empty when no files exist', async () => {
    const files = await loadMemoryFiles({ cwd: project, home });
    expect(files.length).toBe(0);
  });

  test('loads user ~/.claude/CLAUDE.md', async () => {
    await writeFile(join(home, '.claude', 'CLAUDE.md'), 'user-global');
    const files = await loadMemoryFiles({ cwd: project, home });
    expect(files.length).toBe(1);
    expect(files[0]!.type).toBe('User');
    expect(files[0]!.content).toBe('user-global');
  });

  test('loads user ~/.forge/CLAUDE.md alongside .claude variant', async () => {
    await writeFile(join(home, '.claude', 'CLAUDE.md'), 'claude-home');
    await writeFile(join(home, '.forge', 'CLAUDE.md'), 'forge-home');
    const files = await loadMemoryFiles({ cwd: project, home });
    expect(files.length).toBe(2);
    expect(files.map((f) => f.content).sort()).toEqual(['claude-home', 'forge-home']);
  });

  test('walks up from cwd loading project CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md', async () => {
    await writeFile(join(project, 'CLAUDE.md'), 'root-project');
    await writeFile(join(project, '.claude', 'CLAUDE.md'), 'root-dotclaude');
    await writeFile(join(project, 'CLAUDE.local.md'), 'root-local');
    await writeFile(join(nested, 'CLAUDE.md'), 'deep-project');
    const files = await loadMemoryFiles({ cwd: nested, home });
    const contents = files.map((f) => f.content);
    expect(contents).toContain('root-project');
    expect(contents).toContain('root-dotclaude');
    expect(contents).toContain('root-local');
    expect(contents).toContain('deep-project');
    const rootIdx = contents.indexOf('root-project');
    const deepIdx = contents.indexOf('deep-project');
    expect(rootIdx).toBeLessThan(deepIdx);
  });

  test('deduplicates same file discovered twice', async () => {
    await writeFile(join(home, '.claude', 'CLAUDE.md'), 'shared');
    const files1 = await loadMemoryFiles({ cwd: project, home });
    const files2 = await loadMemoryFiles({ cwd: nested, home });
    expect(files1.filter((f) => f.type === 'User').length).toBe(1);
    expect(files2.filter((f) => f.type === 'User').length).toBe(1);
  });

  test('ignores empty files', async () => {
    await writeFile(join(project, 'CLAUDE.md'), '   \n\n\t');
    const files = await loadMemoryFiles({ cwd: project, home });
    expect(files.length).toBe(0);
  });

  test('resolves @include to a sibling file', async () => {
    await writeFile(join(project, 'CLAUDE.md'), 'main\n@./rules.md');
    await writeFile(join(project, 'rules.md'), 'included-rule');
    const files = await loadMemoryFiles({ cwd: project, home });
    const contents = files.map((f) => f.content);
    expect(contents).toContain('main\n@./rules.md');
    expect(contents).toContain('included-rule');
    const included = files.find((f) => f.content === 'included-rule');
    expect(included?.parent).toBeDefined();
  });

  test('prevents @include cycles', async () => {
    await writeFile(join(project, 'CLAUDE.md'), 'a\n@./b.md');
    await writeFile(join(project, 'b.md'), 'b\n@./CLAUDE.md');
    const files = await loadMemoryFiles({ cwd: project, home });
    expect(files.length).toBe(2);
  });

  test('@include depth cap prevents runaway recursion', async () => {
    await writeFile(join(project, 'CLAUDE.md'), '0\n@./a.md');
    await writeFile(join(project, 'a.md'), 'a\n@./b.md');
    await writeFile(join(project, 'b.md'), 'b\n@./c.md');
    await writeFile(join(project, 'c.md'), 'c\n@./d.md');
    await writeFile(join(project, 'd.md'), 'd\n@./e.md');
    await writeFile(join(project, 'e.md'), 'e\n@./f.md');
    await writeFile(join(project, 'f.md'), 'f');
    const files = await loadMemoryFiles({ cwd: project, home });
    expect(files.length).toBeLessThanOrEqual(5);
  });
});

describe('extractIncludes', () => {
  test('finds @relative @./relative @~/home @/abs paths', () => {
    const base = resolve('/tmp/base');
    const home = resolve('/home/user');
    const paths = extractIncludes(
      'see @./a.md and @b.md and @~/c.md\nand @/etc/d.md',
      base,
      home,
    );
    expect(paths).toContain(resolve(base, 'a.md'));
    expect(paths).toContain(resolve(base, 'b.md'));
    expect(paths).toContain(resolve(home, 'c.md'));
    expect(paths).toContain(resolve('/etc/d.md'));
  });

  test('ignores @paths inside fenced code blocks', () => {
    const text = 'before\n```\n@./skip.md\n```\nafter @./take.md';
    const base = resolve('/base');
    const paths = extractIncludes(text, base, resolve('/home'));
    expect(paths).toContain(resolve(base, 'take.md'));
    expect(paths.find((p) => p.endsWith('skip.md'))).toBeUndefined();
  });

  test('ignores @paths inside inline backticks', () => {
    const paths = extractIncludes('use `@./inline.md` not this', resolve('/base'), resolve('/home'));
    expect(paths.find((p) => p.endsWith('inline.md'))).toBeUndefined();
  });

  test('deduplicates repeat refs', () => {
    const paths = extractIncludes('@./x.md @./x.md @./x.md', resolve('/base'), resolve('/home'));
    expect(paths.length).toBe(1);
  });
});

describe('formatMemoryPrompt', () => {
  test('empty input yields empty string', () => {
    expect(formatMemoryPrompt([])).toBe('');
  });

  test('formats with type descriptions + instruction prompt header', () => {
    const out = formatMemoryPrompt([
      { path: '/u/CLAUDE.md', type: 'User', content: 'u-ctx' },
      { path: '/p/CLAUDE.md', type: 'Project', content: 'p-ctx' },
      { path: '/p/CLAUDE.local.md', type: 'Local', content: 'l-ctx' },
    ]);
    expect(out).toContain('user\'s private global instructions');
    expect(out).toContain('project instructions, checked into the codebase');
    expect(out).toContain("user's private project instructions, not checked in");
    expect(out).toContain('u-ctx');
    expect(out).toContain('p-ctx');
    expect(out).toContain('l-ctx');
    expect(out.startsWith('Codebase and user instructions')).toBe(true);
  });
});

describe('stripFencedCode', () => {
  test('removes fenced and inline code', () => {
    const out = stripFencedCodeForTest('a ```b``` c `d` e');
    expect(out).not.toContain('b');
    expect(out).not.toContain('d');
    expect(out).toContain('a');
    expect(out).toContain('c');
    expect(out).toContain('e');
  });
});
