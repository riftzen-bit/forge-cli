import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearSkillCache, formatSkillIndex, loadSkillIndex } from './skills.js';

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'forge-skills-'));
}

afterEach(() => {
  clearSkillCache();
});

describe('loadSkillIndex', () => {
  test('discovers user-scope skills under .claude/skills', async () => {
    const home = await tempDir();
    const cwd = await tempDir();
    try {
      const skillDir = join(home, '.claude', 'skills', 'commit');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), `---\nname: commit\ndescription: Generate commit messages\n---\nbody`);
      const out = await loadSkillIndex({ home, cwd });
      expect(out).toHaveLength(1);
      expect(out[0]!.name).toBe('commit');
      expect(out[0]!.description).toBe('Generate commit messages');
      expect(out[0]!.scope).toBe('user');
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test('discovers project-scope skills under cwd/.claude/skills and sorts by name', async () => {
    const home = await tempDir();
    const cwd = await tempDir();
    try {
      for (const name of ['zeta', 'alpha']) {
        const dir = join(cwd, '.claude', 'skills', name);
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill\n---\n`);
      }
      const out = await loadSkillIndex({ home, cwd });
      expect(out.map((e) => e.name)).toEqual(['alpha', 'zeta']);
      for (const e of out) expect(e.scope).toBe('project');
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test('user-scope wins on name collision; project skill is dropped', async () => {
    const home = await tempDir();
    const cwd = await tempDir();
    try {
      const userDir = join(home, '.claude', 'skills', 'review');
      const projectDir = join(cwd, '.claude', 'skills', 'review');
      await mkdir(userDir, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      await writeFile(join(userDir, 'SKILL.md'), `---\nname: review\ndescription: user version\n---\n`);
      await writeFile(join(projectDir, 'SKILL.md'), `---\nname: review\ndescription: project version\n---\n`);
      const out = await loadSkillIndex({ home, cwd });
      expect(out).toHaveLength(1);
      expect(out[0]!.scope).toBe('user');
      expect(out[0]!.description).toBe('user version');
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test('ignores directories that do not contain SKILL.md', async () => {
    const home = await tempDir();
    const cwd = await tempDir();
    try {
      await mkdir(join(home, '.claude', 'skills', 'no-manifest'), { recursive: true });
      const out = await loadSkillIndex({ home, cwd });
      expect(out).toHaveLength(0);
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test('skills without front-matter name are skipped', async () => {
    const home = await tempDir();
    const cwd = await tempDir();
    try {
      const dir = join(home, '.claude', 'skills', 'broken');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'SKILL.md'), '# no front matter');
      const out = await loadSkillIndex({ home, cwd });
      expect(out).toHaveLength(0);
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe('formatSkillIndex', () => {
  test('returns empty string when there are no skills', () => {
    expect(formatSkillIndex([])).toBe('');
  });

  test('renders each skill with name, scope, path, and description', () => {
    const out = formatSkillIndex([
      { name: 'commit', description: 'Make commits', path: '/x/SKILL.md', scope: 'user' },
      { name: 'review', description: '', path: '/y/SKILL.md', scope: 'project' },
    ]);
    expect(out).toContain('# Available skills');
    expect(out).toContain('- **commit** (user): /x/SKILL.md — Make commits');
    expect(out).toContain('- **review** (project): /y/SKILL.md');
  });
});
