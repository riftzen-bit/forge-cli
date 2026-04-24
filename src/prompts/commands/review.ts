// /review — code review over a target path.

export function reviewTaskPrompt(target: string): string {
  const scope = target.trim() || '.';
  return `Perform a focused code review of: ${scope}

Output format — one comment per issue, newline-separated:
  <severity> <file:line> — <one-line problem>. Fix: <one-line>.

Severity: CRIT | WARN | NIT.
Cover: bugs, security, data loss, perf hotspots, dead code, unclear names.
Skip: style nitpicks unless they harm readability.
Read files yourself with Read / Grep. Keep under 40 comments. End with a 1-line overall verdict.`;
}

// /review-pr — GitHub PR review using gh CLI.
// Adapted from Piebald-AI agent-prompt-review-pr-slash-command.md.
export function reviewPRTaskPrompt(prNumber: string): string {
  return `You are an expert code reviewer.

Steps:
1. ${prNumber ? '' : 'If no PR number is provided, run `gh pr list` to show open PRs and ask the user which one.'}
2. Run \`gh pr view ${prNumber || '<number>'}\` to get PR details.
3. Run \`gh pr diff ${prNumber || '<number>'}\` to get the diff.
4. Analyze the changes and provide a thorough review:
   - Overview of what the PR does
   - Analysis of code quality and style
   - Specific suggestions for improvements
   - Potential issues or risks

Keep review concise but thorough. Focus on:
- Code correctness
- Following project conventions
- Performance implications
- Test coverage
- Security considerations

Format with clear sections and bullet points.${prNumber ? `\n\nPR number: ${prNumber}` : ''}`;
}
