# Quantcept

**An AI-powered finance terminal — an extensible agentic CLI for financial analysis, in your terminal.**

Quantcept is a TUI (terminal UI) application built with [Bun](https://bun.sh), [Solid.js](https://www.solidjs.com/), and [OpenTUI](https://github.com/sst/opentui). It connects to any Anthropic-compatible or OpenAI-compatible LLM API and is designed to be extended with tools, skills, agents, and plugins.

> Status: early foundation. The core engine, terminal UI, and extensibility surfaces are in place, each with a runnable reference example. Expect rapid iteration.

## Quick Start

### Install (npm)

```bash
npm install -g quantcept
quantcept
```

Works in PowerShell, cmd, or any shell once installed. The launcher resolves a
prebuilt binary for your platform (macOS arm64/x64, Linux x64, Windows x64). On
first run, Quantcept walks you through a quick login (email + one-time code); your
key is stored at `~/.quantcept/settings.json`. **No API key or `.env` is required** —
chat generation runs in the cloud by default.

### From source (for development)

```bash
git clone https://github.com/Fincept-Corporation/Quantcept.git
cd Quantcept
bun install
cp .env.example .env   # optional — only for on-device "local" generation
bun run dev
```

### Optional: on-device ("local") generation

By default the assistant generates in the cloud, so most users need nothing beyond
login. If you switch generation to **local** (in Settings), the on-device agent loop
calls an LLM provider you configure. Set these in the environment (dev) or
`~/.quantcept/settings.json`:

| Variable        | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `LLM_API_KEY`   | Your LLM provider API key (local generation only).                 |
| `LLM_BASE_URL`  | Provider base URL. Anthropic-compatible or OpenAI-compatible.      |
| `LLM_MODEL`     | Model name (optional; defaults to a sensible value).               |

The `anthropic-messages` adapter works with Anthropic, MiniMax, and any
Anthropic-compatible gateway. The `openai-chat` adapter works with
OpenAI-compatible endpoints.

> Note: the compiled binary does **not** read `.env` files — that's a dev-only
> convenience. Installed users configure via login and `~/.quantcept/settings.json`.

### Optional prerequisites

A few agent tools shell out to external programs and degrade gracefully if absent:

- **Finance tools** (income / balance sheet / cashflow / price history) need
  **Python 3 + `yfinance`** on your `PATH` — `pip install yfinance`. Without it,
  those tools return a clear error; nothing else is affected.

## Features

- **Provider-agnostic LLM access** — bring your own Anthropic- or OpenAI-compatible API.
- **Tools** — typed, schema-validated capabilities the assistant can call (e.g. a finance calculator), gated by a permission model.
- **Skills** — Markdown-defined expertise the assistant can apply.
- **Agents** — named personas with their own system prompts.
- **Plugins** — bundle skills (and more) for distribution.
- **Marketplace** — discover and install plugins from an index.
- **Themeable TUI** — multiple bundled themes, smooth terminal rendering via OpenTUI.

## How It's Built

Quantcept is a single package with a headless core engine (`src/core/`), a
Solid/OpenTUI terminal UI (`src/tui/`), and contributor-facing extensibility
surfaces (`src/extensions/`). The engine runs without a terminal, which keeps it
testable and reusable. See [CLAUDE.md](./CLAUDE.md) for the full architecture and
[CONTRIBUTING.md](./CONTRIBUTING.md) to add your own tools, skills, or plugins.

## Development

```bash
bun run typecheck   # TypeScript strict check
bun run lint        # Biome
bun test            # test suite
bun run build       # compile a standalone binary for your platform
```

## License

[Apache-2.0](./LICENSE)
