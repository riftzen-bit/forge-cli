# Forge

Terminal-native coding agent powered by the Claude Agent SDK. A Claude Code–style experience in Ink/React with diff rendering, streaming thinking, concurrent agents, todos, plan mode, hooks, MCP, auto-compact, and permission rules.

Forge is an open alternative you can read end-to-end and customize. Contributions welcome.

---

## Features

- **Streaming thinking** — model reasoning is rendered live while the agent works, then persisted so you can audit how decisions were made.
- **Claude-style diffs** — `● Update(path)` / `● Create(path)` headers, added/removed line counts, numbered side-by-side context, red/green full-width stripes.
- **Concurrent agents** — `/parallel taskA || taskB || taskC` spawns multiple agents at once with a shared file lock so they never step on each other.
- **Subagents** — `/task <goal>` spawns a fresh agent for a side-quest without polluting the main thread.
- **Plan mode** — `/plan` toggles read-only reasoning. The agent may think and propose but cannot write, edit, or execute.
- **Todos** — `/todo add`, `/todo doing N`, `/todo done N`, `/todo list`. Visible as a live panel above the input.
- **Auto-compact** — at 160k tokens you get a warning; at 180k Forge summarises the history and keeps the tail so you never hit the 200k wall mid-task.
- **Permission rules** — allow/deny lists with wildcard + regex patterns in `settings.json`.
- **Hooks** — pre/post-tool shell hooks (run tests before every edit, lint after every write, etc).
- **MCP servers** — pass through MCP server config from `settings.json`.
- **Custom status line** — template variables like `{model} {effort} {cwd} {ctx}` in `settings.json`.
- **OAuth or API key** — either route your calls through Claude Code's official credential store, or drop in your own `sk-ant-` key.

---

## Quick start

Prereqs: Node 20+ and [Bun](https://bun.sh) (recommended — Forge itself is built with Bun).

```bash
git clone https://github.com/riftzen-bit/forge-cli
cd forge-cli
bun install
bun run build
npm link               # puts `forge` on PATH (also linked as `map`)
```

First run:

```bash
forge login            # [1] OAuth via Claude Code, or [2] paste sk-ant-...
forge                  # launch interactive session
```

One-shot:

```bash
forge "read src/server.ts and add request-id middleware with tests"
```

Whole-project scaffolding:

```bash
mkdir my-app && cd my-app
forge "build a React + Vite todo app with TypeScript, Tailwind, local-storage \
       persistence, vitest tests, and a README"
```

---

## In-session slash commands

| Command | What it does |
|---|---|
| `/help` | List commands. |
| `/model [id]` | Open picker or set model. |
| `/effort [level]` | Open picker or set reasoning effort (Low–X-High). |
| `/plan` | Toggle plan mode (read-only reasoning). |
| `/parallel a || b || c` | Run multiple agents concurrently with file-lock safety. |
| `/task <goal>` | Spawn a subagent for a side-quest. |
| `/todo [list\|add\|doing N\|done N\|rm N\|clear]` | Manage the todo panel. |
| `/compact` | Manually summarize history. |
| `/resume` | Pick a past session to continue. |
| `/exit` | Leave. |

Keybindings: `Ctrl+O` toggle verbose detail, `Tab` autocomplete slash, `↑/↓` navigate command palette, `Esc` cancel, `Ctrl+C` exit.

---

## Configuration

Settings live at `~/.forge/settings.json` (zod-validated on load).

```json
{
  "defaultModel": "opus",
  "effort": "X-High",
  "statusLine": "{model} · {effort} · {cwd} · ctx {ctx}",
  "permissionRules": [
    { "tool": "Bash", "match": "rm\\s+-rf", "decision": "deny" },
    { "tool": "Write", "match": ".env$", "decision": "deny" }
  ],
  "hooks": {
    "preTool": [
      { "tool": "Edit", "run": "echo pre-edit $FORGE_HOOK_INPUT >> ~/.forge/audit.log" }
    ],
    "postTool": [
      { "tool": "Write", "run": "prettier --write $FORGE_HOOK_INPUT_PATH" }
    ]
  },
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."] }
  }
}
```

Status-line template vars: `{model}`, `{effort}`, `{auth}`, `{cwd}`, `{plan}`, `{ctx}` (percent), `{tokens}` (raw).

Hook env passed to shell: `FORGE_HOOK_TOOL`, `FORGE_HOOK_PHASE` (`pre` or `post`), `FORGE_HOOK_INPUT` (JSON).

---

## CLI reference

| Command | Description |
|---|---|
| `forge` | Launch interactive session. |
| `forge "<prompt>"` | One-shot. Agent executes and exits. |
| `forge -p "<prompt>"` | Same, explicit flag. |
| `forge -m <model> "<prompt>"` | Override model for this run. |
| `forge login` | Interactive auth (OAuth or API key). |
| `forge set login <key>` | Store API key non-interactively. |
| `forge set model <alias\|id>` | Set default model. |
| `forge set theme <dark\|light>` | UI theme. |
| `forge set telemetry <on\|off>` | Toggle telemetry. |
| `forge config` | Dump settings JSON. |
| `forge config --get <key>` | Read one setting. |
| `forge config --set k=v` | Write one setting. |
| `forge version` | Version + known model aliases. |
| `map ...` | Alias of `forge ...`. |

---

## Models

| Alias | ID |
|---|---|
| `opus` | `claude-opus-4-7` |
| `sonnet` | `claude-sonnet-4-5` *(default)* |
| `haiku` | `claude-haiku-4-5` |

Edit `src/agent/models.ts` to refresh.

---

## Security

- **OAuth path** — Forge never sees the raw Claude Code token. It only records `authMode=claude-code-oauth` and the path to the `claude` binary. PKCE exchange, refresh, and storage all happen inside Claude Code.
- **API-key path** — key stored via OS keychain (`keytar`) where available, else `~/.forge/auth.json` with `0600` perms. Env `ANTHROPIC_API_KEY` always wins.
- `/logout` clears the stored API key; for OAuth, run `claude logout` to revoke at source.
- Tool writes are scoped to `process.cwd()`. Run Forge only in directories you trust.
- Permission rules (`permissionRules` in settings) let you hard-deny dangerous tool/pattern combos.
- Concurrent agents share a file-lock manager so two agents can never read/write the same path at the same time.
- `FORGE_DEBUG=1` prints full stack traces.
- No token is ever logged, echoed, or written to transcript.

---

## Architecture

```
bin/forge.mjs                  launcher (also `map`)
src/cli.tsx                    commander entry, subcommand dispatch
src/app.tsx                    Ink root
src/components/                Banner, Tips, ChatScreen, MessageRow, Diff, ThinkingLine, TodoList, ...
src/agent/client.ts            AgentClient — SDK wrapper with thinking, tool events, auto-compact
src/agent/pool.ts              AgentPool — concurrent agents + shared file lock
src/agent/fileLocks.ts         per-path mutex for safe parallelism
src/agent/subagent.ts          one-shot fresh agent
src/agent/todos.ts             todo store (emit/subscribe)
src/agent/contextBudget.ts     token estimation + warn/compact thresholds
src/agent/permissions.ts       allow/deny rule matcher
src/agent/hooks.ts             pre/post shell hook runner
src/agent/models.ts            alias → id
src/agent/effort.ts            Low..X-High → thinking token budget
src/agent/systemPrompt.ts      inlined SYSTEM_PROMPT + memory-file composition
src/auth/                      OAuth + API-key paths, keychain, status detection
src/config/                    paths, settings zod, token store
src/commands/                  login, set, config, version, slash
src/session/store.ts           resumable session index
```

---

## Development

```bash
bun install
bun run dev          # run from src without building
bun run typecheck    # tsc --noEmit
bun test             # bun test
bun run build        # bundle to dist/cli.js
```

Tests: 38 (unit). File locks, pool, context budget, todos, permissions, status-bar render.

Runs Windows / macOS / Linux. On Windows, PowerShell and Windows Terminal both work; legacy conhost has known Ink redraw glitches outside Forge's control.

---

## Contributing

- PRs welcome. Open an issue first for anything structural.
- Keep changes minimal and focused. Match existing style.
- Before requesting review: `bun run typecheck && bun test && bun run build`.
- No dependency additions without discussion.

---

## License

MIT.
