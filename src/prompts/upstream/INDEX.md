# Upstream Claude Code System Prompts — Forge Archive

**Source:** [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts) (MIT, © 2025 Piebald LLC).

This directory contains the full 284-file Piebald-AI prompt corpus verbatim plus LICENSE + README, bundled for completeness and transparency. **Nothing is missing.**

## Runtime vs Archive

Forge loads prompts in THREE layers, each on-demand:

**Layer 1 — Base system prompt** (always on, ~4k tokens):
Identity, security, thinking, doing-tasks, executing-actions, tool general, tone/style. Composed once in `src/prompts/index.ts`.

**Layer 2 — Feature pieces** (appended to system prompt when that feature is active):
- `PLAN_MODE` — only when plan mode is on (`src/prompts/features/plan-mode.ts`)

**Layer 3 — Task prompts / subagent personas** (NOT system prompt — loaded as first user message when triggered):
- Slash command prompts (`src/prompts/commands/*`): /commit, /review, /review-pr, /security-review, /pr, /explain, /test
- Subagent personas (`src/prompts/agents.ts`): Explore, General-Purpose, Verification, Summary, Compaction

Pieces tied to features Forge does not implement (Chrome browser automation, managed agents, dream mode, learning mode, REPL, scratchpad, remote planning, insights analytics, background jobs, skillify, auto-mode, PowerShell-specific sleep rules) are archived here for reference only — not loaded at runtime.

Loading every upstream piece unconditionally would:
- Bloat the prompt 5–10× with rules for tools Forge doesn't expose
- Introduce contradictions (e.g. Chrome-only rules when we have no Chrome tool)
- Increase per-request cost substantially with no quality gain

Each piece below is tagged `[ACTIVE]` (loaded in one of the three layers above) or `[ARCHIVED]` (on-disk reference only). Promote an archived piece by referencing it from `src/prompts/index.ts`, a feature module, or a command module.

## Active pieces — main system prompt

These flow into every Forge turn via `src/prompts/index.ts`:

- system-prompt-communication-style.md [ACTIVE]
- system-prompt-doing-tasks-software-engineering-focus.md [ACTIVE]
- system-prompt-doing-tasks-ambitious-tasks.md [ACTIVE]
- system-prompt-doing-tasks-no-compatibility-hacks.md [ACTIVE]
- system-prompt-doing-tasks-no-unnecessary-error-handling.md [ACTIVE]
- system-prompt-doing-tasks-security.md [ACTIVE]
- system-prompt-doing-tasks-help-and-feedback.md [ACTIVE]
- system-prompt-executing-actions-with-care.md [ACTIVE]
- system-prompt-hooks-configuration.md [ACTIVE]
- system-prompt-parallel-tool-call-note-part-of-tool-usage-policy.md [ACTIVE]
- system-prompt-tone-and-style-code-references.md [ACTIVE]
- system-prompt-tone-and-style-concise-output-short.md [ACTIVE]
- system-prompt-tool-execution-denied.md [ACTIVE]
- system-prompt-tool-usage-subagent-guidance.md [ACTIVE]
- system-prompt-tool-usage-task-management.md [ACTIVE]
- system-prompt-subagent-delegation-examples.md [ACTIVE]
- system-prompt-partial-compaction-instructions.md [ACTIVE]
- system-prompt-context-compaction-summary.md [ACTIVE]
- tool-description-readfile.md [ACTIVE]
- tool-description-write.md [ACTIVE]
- tool-description-edit.md [ACTIVE]
- tool-description-bash-overview.md [ACTIVE]
- tool-description-bash-prefer-dedicated-tools.md [ACTIVE]
- tool-description-bash-no-newlines.md [ACTIVE]
- tool-description-bash-parallel-commands.md [ACTIVE]
- tool-description-bash-sequential-commands.md [ACTIVE]
- tool-description-bash-maintain-cwd.md [ACTIVE]
- tool-description-bash-quote-file-paths.md [ACTIVE]
- tool-description-bash-alternative-content-search.md [ACTIVE]
- tool-description-bash-alternative-file-search.md [ACTIVE]
- tool-description-bash-alternative-read-files.md [ACTIVE]
- tool-description-bash-alternative-edit-files.md [ACTIVE]
- tool-description-bash-alternative-write-files.md [ACTIVE]
- tool-description-bash-git-prefer-new-commits.md [ACTIVE]
- tool-description-bash-git-avoid-destructive-ops.md [ACTIVE]
- tool-description-bash-git-never-skip-hooks.md [ACTIVE]
- tool-description-bash-git-commit-and-pr-creation-instructions.md [ACTIVE]
- tool-description-todowrite.md [ACTIVE]
- tool-description-webfetch.md [ACTIVE]
- tool-description-websearch.md [ACTIVE]
- tool-description-notebookedit.md [ACTIVE]

## Active pieces — subagent prompts

Loaded on demand when the matching subagent is spawned:

- agent-prompt-explore.md [ACTIVE — Explore subagent]
- agent-prompt-general-purpose.md [ACTIVE — /task, spawn_agent default]
- agent-prompt-conversation-summarization.md [ACTIVE — /compact]
- agent-prompt-verification-specialist.md [ACTIVE — verify step]
- agent-prompt-quick-git-commit.md [ACTIVE — /commit]
- agent-prompt-quick-pr-creation.md [ACTIVE — /pr]
- agent-prompt-security-review-slash-command.md [ACTIVE — /security-review]
- agent-prompt-review-pr-slash-command.md [ACTIVE — /review]
- agent-prompt-webfetch-summarizer.md [ACTIVE — internal WebFetch]
- agent-prompt-claudemd-creation.md [ACTIVE — /init]

## Dynamic auto-injection (Layer 4)

`src/prompts/upstream/loader.ts` exposes a lazy reader for any piece in
this directory, keyed by stable id. `src/prompts/dynamic.ts` decides
which extra pieces to append to the base prompt for a given turn:

- **Always-on extras**: parallel-tool-call note, code-reference style, malicious-content refusal.
- **Mode triggers**: `permissionMode === 'plan'` → `agent-prompt-plan-mode-enhanced.md`. `effort === 'Low'` → `system-prompt-minimal-mode.md` + concise tone.
- **Keyword triggers** on the latest user message:
  - memory / CLAUDE.md / skill → memory instructions + staleness verification
  - subagent / delegate / spawn_agent → delegation + prompt-writing examples
  - hook / settings.json → hooks-configuration
  - compact / summarize → context-compaction-summary + partial-compaction
  - schedule / cron / background → background-job-behavior

Every piece is read on first use and cached in-process for the rest of
the session. Adding a new trigger costs no extra disk I/O on unrelated
turns. Subagents pass `isSubagent: true` so main-agent-only pieces drop.

## Archived pieces

Everything else in this directory remains archived from the runtime path
even after dynamic injection. Examples of what Forge still does not load:

- Chrome browser / computer-use tooling (Forge is terminal-only)
- Managed Agents platform prompts (Anthropic-internal)
- Dream memory consolidation (specific Claude Code feature)
- Learning mode & insights analytics
- REPL & scratchpad directories
- Remote planning / ultraplan
- Skillify & session-skill conversion
- PowerShell 5.1-specific sleep-command policy
- Auto-mode (Claude Code internal mode)

These files remain on disk so future Forge features can activate them without re-downloading. To promote an archived piece to active, reference it from `src/prompts/index.ts` (for main prompt) or from a subagent factory (for a subagent).
