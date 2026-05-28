# Quantcept

**An AI-powered finance terminal — an extensible agentic CLI for financial analysis, in your terminal.**

Quantcept is a TUI (terminal UI) application built with [Bun](https://bun.sh), [Solid.js](https://www.solidjs.com/), and [OpenTUI](https://github.com/sst/opentui). It connects to any Anthropic-compatible or OpenAI-compatible LLM API and is designed to be extended with tools, skills, agents, and plugins.

> Status: early foundation. The core engine, terminal UI, and extensibility surfaces are in place, each with a runnable reference example. Expect rapid iteration.

## Quick Start

### From source (recommended while in development)

```bash
git clone https://github.com/Fincept-Corporation/Quantcept.git
cd Quantcept
bun install
cp .env.example .env   # then edit .env with your provider key
bun run dev
```

### Configure your provider

Quantcept is provider-agnostic. Set these in `.env` (or your shell environment):

| Variable        | Required | Description                                                        |
| --------------- | -------- | ------------------------------------------------------------------ |
| `LLM_API_KEY`   | yes      | Your LLM provider API key.                                         |
| `LLM_BASE_URL`  | yes      | Provider base URL. Anthropic-compatible or OpenAI-compatible.      |
| `LLM_MODEL`     | no       | Model name (defaults to a sensible value).                         |

The `anthropic-messages` adapter works with Anthropic, MiniMax, and any
Anthropic-compatible gateway. The `openai-chat` adapter works with
OpenAI-compatible endpoints.

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
