// Per-slash-command task prompts. Each builder returns the text that goes
// into the agent's user-facing turn when that slash command fires. The main
// system prompt stays lean; these are loaded ONLY when the specific command
// is invoked.

export { commitTaskPrompt } from './commit.js';
export { reviewTaskPrompt, reviewPRTaskPrompt } from './review.js';
export { securityReviewTaskPrompt } from './security-review.js';
export { prTaskPrompt } from './pr.js';
export { explainTaskPrompt } from './explain.js';
export { testTaskPrompt } from './test.js';
