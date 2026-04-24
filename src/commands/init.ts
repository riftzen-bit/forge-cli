import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const TEMPLATE = (name: string): string => `# ${name}

Project-specific instructions for coding agents (Forge, Claude Code, etc.).

## Overview

- What this project does:
- Primary language(s) / framework(s):
- Entrypoint(s):

## Commands

- Install:
- Dev / run:
- Build:
- Test:
- Lint / typecheck:

## Conventions

- Style:
- Imports:
- Testing:
- Commit messages:

## Architecture notes

Describe the key modules, data flow, and any non-obvious constraints here.

## Do / Don't

- Prefer \`edit existing files\` over creating new ones.
- Run the test suite before reporting completion.
- Avoid adding dependencies without discussion.
`;

export async function runInit(cwd: string): Promise<string> {
  const path = join(cwd, 'CLAUDE.md');
  try {
    await readFile(path, 'utf8');
    return `CLAUDE.md already exists at ${path}. skipping.`;
  } catch {
    /* not present, create */
  }
  const name = basename(cwd) || 'Project';
  await writeFile(path, TEMPLATE(name), 'utf8');
  return `wrote ${path}. edit it to describe your project; forge loads it into every session.`;
}
