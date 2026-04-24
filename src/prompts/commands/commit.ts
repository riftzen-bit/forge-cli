// /commit — Conventional Commits with project-style awareness.
// Adapted from Piebald-AI agent-prompt-quick-git-commit.md.

export function commitTaskPrompt(diff: string): string {
  return `You will create a single git commit.

## Context
You must first gather:
- \`git status\` (short)
- \`git diff HEAD\` (shown below)
- \`git branch --show-current\`
- \`git log --oneline -10\` (recent commit style)

## Git Safety Protocol (HARD RULES)
- NEVER update git config.
- NEVER skip hooks (--no-verify, --no-gpg-sign) unless user explicitly asked.
- ALWAYS create NEW commits. NEVER use \`git commit --amend\` unless user explicitly asked.
- Do not commit files that may contain secrets (.env, credentials.json, etc). Warn the user if such files are staged.
- If nothing is staged and no modifications exist, do not create an empty commit — just say so.
- Never use interactive git flags (-i).

## Task
Based on the diff, create a single commit:
1. Analyze staged changes. Mirror the repo's existing commit style (check \`git log --oneline -10\`).
   - Subject <= 50 chars, imperative mood, Conventional Commits format: \`<type>(<scope>): <subject>\`
   - Types: feat, fix, refactor, perf, docs, test, chore, build, ci, style
   - Body (optional, <= 72 cols wrap) explains WHY, not WHAT, only if non-obvious.
2. Stage relevant files (if anything unstaged belongs) and run \`git commit -m "..."\`.

No emoji. No AI trailers. Plain text.

--- diff start ---
${diff}
--- diff end ---`;
}
