import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadProjectPermissions,
  appendProjectAllow,
  matchPatternFor,
  shouldPrompt,
  projectPermissionsPath,
  projectRulesAsPermissionRules,
} from './projectPermissions.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'forge-perms-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadProjectPermissions', () => {
  test('returns empty allowed list when file does not exist', async () => {
    const p = await loadProjectPermissions(dir);
    expect(p.allowed).toEqual([]);
  });

  test('returns empty allowed list when file is corrupt JSON', async () => {
    const path = projectPermissionsPath(dir);
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(dir, '.forge'), { recursive: true });
    await writeFile(path, 'not json', 'utf8');
    const p = await loadProjectPermissions(dir);
    expect(p.allowed).toEqual([]);
  });
});

describe('appendProjectAllow', () => {
  test('writes a new rule and creates .forge dir if missing', async () => {
    const p = await appendProjectAllow(dir, { tool: 'Bash', match: '^ls(\\s|$)', decision: 'allow' });
    expect(p.allowed.length).toBe(1);
    expect(p.allowed[0]!.addedAt).toBeDefined();

    const raw = await readFile(projectPermissionsPath(dir), 'utf8');
    const parsed = JSON.parse(raw) as { allowed: unknown[] };
    expect(parsed.allowed.length).toBe(1);
  });

  test('does not duplicate identical rules', async () => {
    await appendProjectAllow(dir, { tool: 'Bash', match: '^ls(\\s|$)', decision: 'allow' });
    const p = await appendProjectAllow(dir, { tool: 'Bash', match: '^ls(\\s|$)', decision: 'allow' });
    expect(p.allowed.length).toBe(1);
  });

  test('appends distinct rules for the same tool', async () => {
    await appendProjectAllow(dir, { tool: 'Bash', match: '^ls(\\s|$)', decision: 'allow' });
    const p = await appendProjectAllow(dir, { tool: 'Bash', match: '^git(\\s|$)', decision: 'allow' });
    expect(p.allowed.length).toBe(2);
  });
});

describe('matchPatternFor', () => {
  test('Bash extracts first whitespace-separated token, regex-anchored', () => {
    const pat = matchPatternFor('Bash', { command: 'ls -la /tmp' });
    expect(pat).toBe('^ls(\\s|$)');
  });

  test('Bash escapes regex metacharacters in the program name', () => {
    const pat = matchPatternFor('Bash', { command: 'a.b+c arg' });
    expect(pat).toBe('^a\\.b\\+c(\\s|$)');
  });

  test('Bash returns undefined for empty command', () => {
    expect(matchPatternFor('Bash', { command: '' })).toBeUndefined();
    expect(matchPatternFor('Bash', {})).toBeUndefined();
  });

  test('Edit/Write match exact file path', () => {
    expect(matchPatternFor('Edit', { file_path: '/a/b.ts' })).toBe('^/a/b\\.ts$');
    expect(matchPatternFor('Write', { file_path: '/x.txt' })).toBe('^/x\\.txt$');
  });

  test('NotebookEdit matches file path', () => {
    expect(matchPatternFor('NotebookEdit', { file_path: '/n.ipynb' })).toBe('^/n\\.ipynb$');
  });

  test('Read accepts both file_path and path keys', () => {
    expect(matchPatternFor('Read', { file_path: '/a.ts' })).toBe('^/a\\.ts$');
    expect(matchPatternFor('Read', { path: '/b.ts' })).toBe('^/b\\.ts$');
  });

  test('WebFetch reduces URL to scheme + host', () => {
    expect(matchPatternFor('WebFetch', { url: 'https://example.com/path?q=1' })).toBe(
      '^https://example\\.com',
    );
  });

  test('unknown tool returns undefined', () => {
    expect(matchPatternFor('SomethingElse', { x: 'y' })).toBeUndefined();
  });
});

describe('shouldPrompt', () => {
  test('read-only tools never prompt', () => {
    expect(shouldPrompt('Read')).toBe(false);
    expect(shouldPrompt('Glob')).toBe(false);
    expect(shouldPrompt('Grep')).toBe(false);
    expect(shouldPrompt('TodoWrite')).toBe(false);
    expect(shouldPrompt('NotebookRead')).toBe(false);
  });

  test('mutating tools prompt by default', () => {
    expect(shouldPrompt('Bash')).toBe(true);
    expect(shouldPrompt('Edit')).toBe(true);
    expect(shouldPrompt('Write')).toBe(true);
    expect(shouldPrompt('WebFetch')).toBe(true);
    expect(shouldPrompt('NotebookEdit')).toBe(true);
  });
});

describe('projectRulesAsPermissionRules', () => {
  test('strips addedAt, preserves tool/match/decision', () => {
    const rules = projectRulesAsPermissionRules({
      allowed: [
        { tool: 'Bash', match: '^ls', decision: 'allow', addedAt: '2025-01-01' },
        { tool: 'Edit', decision: 'allow' },
      ],
    });
    expect(rules).toEqual([
      { tool: 'Bash', match: '^ls', decision: 'allow' },
      { tool: 'Edit', decision: 'allow' },
    ]);
  });
});
