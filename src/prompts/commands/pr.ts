// /pr — draft a pull request from current branch.
// Adapted from Piebald-AI agent-prompt-quick-pr-creation.md.

export function prTaskPrompt(baseBranch: string = 'main'): string {
  return `You will create a GitHub pull request for the current branch.

## Context (gather first)
- \`git branch --show-current\` — current branch name
- \`git log ${baseBranch}..HEAD --oneline\` — commits on this branch
- \`git diff ${baseBranch}..HEAD\` — full diff vs base
- \`git status\` — any uncommitted work?

## Safety
- NEVER skip hooks or bypass signing.
- NEVER force-push.
- If uncommitted changes exist, stop and ask the user whether to commit them first.

## Task
1. If uncommitted changes exist — STOP. Report them to the user; do not create the PR yet.
2. If the branch is not pushed — \`git push -u origin <branch>\`.
3. Analyze commits + diff. Draft a PR body with:
   - **Summary**: 1-2 sentences, WHY this change exists.
   - **Changes**: bullet list of what was modified.
   - **Test plan**: how the change was verified (or "not yet tested").
4. Run \`gh pr create --base ${baseBranch} --title "<title>" --body "<body>"\`.

Title: short, imperative, mirrors commit style if consistent. No emoji, no trailers.`;
}
