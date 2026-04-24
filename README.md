# Forge

Terminal-native coding agent powered by the Claude Agent SDK. A Claude Code–style experience in Ink/React with diff rendering, streaming thinking, concurrent agents, todos, plan mode, hooks, MCP, auto-compact, permission rules, **multi-provider routing** (Anthropic / OpenRouter / DeepSeek / Z.ai / GLM / Kimi / NVIDIA / OpenAI), and code-intel slash commands (`/review`, `/explain`, `/test`, `/diff`, `/commit`, `/stats`, `/cost`).

Forge is an open alternative you can read end-to-end and customize. Contributions welcome.

---

## Features

- **Multi-provider** — point Forge at any Anthropic-Messages-compatible endpoint. Native support: Anthropic, OpenRouter, DeepSeek (Anthropic-compat), Z.ai / GLM, Kimi / Moonshot. Via LiteLLM proxy: NVIDIA NIM, OpenAI, or any custom endpoint.
- **Streaming thinking + text** — model reasoning and final reply both stream live. Thinking blocks are flushed to history at each tool call so the live panel never shows stale thought.
- **Claude-style diffs** — `● Update(path)` / `● Create(path)` headers, added/removed line counts, numbered side-by-side context, red/green full-width stripes.
- **Concurrent agents** — `/parallel taskA || taskB || taskC` spawns multiple agents at once with a shared file lock so they never step on each other.
- **Subagents** — `/task <goal>` spawns a fresh agent for a side-quest without polluting the main thread.
- **Code intelligence** — `/review` structured code review, `/explain <path>[:L1-L2]` explains code range, `/test` runs + summarises suite, `/diff` renders git diff, `/commit` AI-generated Conventional Commit for staged changes.
- **Session stats + cost** — `/stats` tokens / tools / elapsed; `/cost` estimated USD per model/provider from live usage.
- **Input history** — Up/Down recalls past prompts across sessions, persisted to `~/.forge/history.jsonl`.
- **Smarter errors** — 401 → "run /login", 429 → auto-retry with backoff, network → retry, quota → switch-provider hint.
- **Plan mode** — `/plan` toggles read-only reasoning. The agent may think and propose but cannot write, edit, or execute.
- **Todos** — `/todo add`, `/todo doing N`, `/todo done N`, `/todo list`. Visible as a live panel above the input.
- **Auto-compact** — at 160k tokens you get a warning; at 180k Forge summarises the history and keeps the tail so you never hit the 200k wall mid-task.
- **Permission rules** — allow/deny lists with wildcard + regex patterns in `settings.json`.
- **Hooks** — pre/post-tool shell hooks (run tests before every edit, lint after every write, etc).
- **MCP servers** — manage live with `/mcp list|add|rm` or declare in `settings.json`.
- **Custom status line** — template variables like `{model} {provider} {effort} {cwd} {ctx}` in `settings.json`.
- **OAuth or API key** — either route your calls through Claude Code's official credential store, or drop in your own `sk-ant-` key. Per-provider keys stored in `~/.forge/keys.json` (0600).

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
| `/provider [id]` | Open provider picker (anthropic / openrouter / deepseek / zai / glm / kimi / nvidia / openai / custom). |
| `/effort [level]` | Open picker or set reasoning effort (Low, Medium, High, X-High, Max). |
| `/plan` | Toggle plan mode (read-only reasoning). |
| `/parallel a || b || c` | Run multiple agents concurrently with file-lock safety. |
| `/task <goal>` | Spawn a subagent for a side-quest. |
| `/review [path]` | Structured code review by a subagent. |
| `/explain <path>[:L1-L2]` | Explain a file or line range. |
| `/test [pattern]` | Detect runner, run tests, summarise pass/fail. |
| `/diff [path]` | Render the git diff. |
| `/commit` | AI-generated Conventional Commit message for the staged diff, then commits. |
| `/stats` | Session stats: tokens, tool counts, elapsed, cost. |
| `/cost` | Per-model cost breakdown for the active session. |
| `/retry` | Resend the last user message. |
| `/mcp list\|add\|rm` | Manage MCP servers without editing JSON. |
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
  "defaultModel": "claude-opus-4-7",
  "effort": "X-High",
  "activeProvider": "anthropic",
  "providers": {
    "openrouter": { "baseURL": "https://openrouter.ai/api" },
    "custom": { "baseURL": "http://my-proxy:8080", "defaultModel": "anthropic/claude-opus-4.7" }
  },
  "statusLine": "{model}@{provider} · {effort} · {cwd} · ctx {ctx}",
  "inputHistory": { "enabled": true, "max": 500 },
  "permissionRules": [
    { "tool": "Bash", "match": "rm\\s+-rf", "decision": "deny" },
    { "tool": "Write", "match": ".env$", "decision": "deny" }
  ],
  "hooks": {
    "preTool": [
      { "match": "Edit", "run": "echo pre-edit $FORGE_HOOK_INPUT >> ~/.forge/audit.log" }
    ],
    "postTool": [
      { "match": "Write", "run": "prettier --write $FORGE_HOOK_INPUT_PATH" }
    ]
  },
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."] }
  }
}
```

Status-line template vars: `{model}`, `{provider}`, `{effort}`, `{auth}`, `{cwd}`, `{plan}`, `{ctx}` (percent), `{tokens}` (raw).

Hook env passed to shell: `FORGE_HOOK_TOOL`, `FORGE_HOOK_PHASE` (`pre` or `post`), `FORGE_HOOK_INPUT` (JSON).

---

## CLI reference

| Command | Description |
|---|---|
| `forge` | Launch interactive session. |
| `forge "<prompt>"` | One-shot. Agent executes and exits. |
| `forge -p "<prompt>"` | Same, explicit flag. |
| `forge -m <model> "<prompt>"` | Override model for this run. |
| `forge login` | Interactive auth (OAuth or API key, Anthropic). |
| `forge login --provider <id>` | Login for another provider (`openrouter`, `deepseek`, `zai`, `glm`, `kimi`, `nvidia`, `openai`, `custom`). Prompts for base URL on non-native or custom providers. |
| `forge login --oauth` | Run `claude setup-token` and capture the token. |
| `forge set provider <id>` | Set active provider. |
| `forge set baseurl <url> [--provider <id>]` | Override base URL for a provider. |
| `forge set model <alias\|id>` | Set default model. |
| `forge set login <key>` | Store Anthropic API key non-interactively. |
| `forge set theme <dark\|light>` | UI theme. |
| `forge set telemetry <on\|off>` | Toggle telemetry. |
| `forge config` | Dump settings JSON. |
| `forge config --get <key>` | Read one setting. |
| `forge config --set k=v` | Write one setting. |
| `forge version` | Version + active provider + models. |
| `map ...` | Alias of `forge ...`. |

### Provider setup examples

```bash
# Anthropic (default)
forge login                              # paste sk-ant-... key

# OpenRouter — one key, many models
forge login --provider openrouter        # paste sk-or-... key
forge set provider openrouter
forge set model anthropic/claude-sonnet-4.5

# DeepSeek (native Anthropic-compat)
forge login --provider deepseek
forge set provider deepseek
forge set model deepseek-chat

# NVIDIA NIM via LiteLLM proxy
pip install litellm
litellm --model nvidia/llama-3.1-nemotron-70b-instruct --port 4000 &
forge login --provider nvidia            # paste nvapi-... key
forge set provider nvidia
# (baseurl defaults to http://localhost:4000 — override with `forge set baseurl`)

# OpenAI via LiteLLM proxy (Anthropic-compat wrapper)
litellm --model openai/gpt-4o --port 4000 --api_key $OPENAI_API_KEY &
forge login --provider openai
forge set provider openai
forge set model gpt-4o
```

---

## Models

Built-in catalog (provider-tagged). `resolveModel()` accepts both label and ID.

| Provider | Example IDs |
|---|---|
| Anthropic | `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5` |
| OpenRouter | `anthropic/claude-sonnet-4.5`, `openai/gpt-4o`, `google/gemini-2.5-pro`, `deepseek/deepseek-chat`, `meta-llama/llama-3.1-70b-instruct` |
| DeepSeek | `deepseek-chat`, `deepseek-reasoner` |
| Z.ai / GLM | `glm-4.6`, `glm-4.6-flash` |
| Kimi | `kimi-k2`, `kimi-k2-turbo-preview` |
| NVIDIA NIM | `nvidia/llama-3.1-nemotron-70b-instruct`, `nvidia/llama-3.1-nemotron-ultra-253b-v1` |
| OpenAI | `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini` |

Default: `claude-opus-4-7`. Edit `src/agent/models.ts` to add/refresh.

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
src/agent/effort.ts            Low..Max → thinking token budget
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
