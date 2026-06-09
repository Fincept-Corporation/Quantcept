# Contributing to Quantcept

Thanks for your interest in contributing. This guide covers the project layout,
the rules that keep the codebase healthy, and how to add the things people most
commonly want to add: tools, skills, slash commands, agents, and plugins.

## Development Setup

- Install [Bun](https://bun.sh) **1.3.14** (the version CI pins).
- `bun install`
- `cp .env.example .env` and add an `LLM_API_KEY` for manual testing.

Everything must stay green before you open a PR:

```bash
bun run typecheck   # tsc --noEmit, strict
bun run lint        # biome (0 errors required; warnings are advisory)
bun test            # bun:test
bun run build       # compiles + smoke-tests a standalone binary
```

## Project Layout & The Dependency Rule

Source lives under `src/` in five top-level directories:

| Directory         | Responsibility                                                        |
| ----------------- | --------------------------------------------------------------------- |
| `src/core/`       | **Headless engine** — config, LLM providers, tools, permissions, agent loop. No UI. |
| `src/extensions/` | Contributor surfaces — skills, commands, agents, plugins, marketplace. |
| `src/tui/`        | All Solid.js + OpenTUI terminal UI.                                    |
| `src/cli/`        | Process entry and CLI verbs; composes core + tui.                     |
| `src/shared/`     | Primitives (errors, logger) used by every layer.                      |

**The one rule that matters most:** dependencies flow one way —
`shared ← core ← extensions ← tui`, and `cli` composes them. In particular,
**nothing in `src/core/` may import from `@tui/*`.** The engine must run without a
terminal. A `@core` file importing `@tui` is a bug, not a style nit.

Use the path aliases (`@core/*`, `@ext/*`, `@tui/*`, `@shared/*`, `@cli/*`, `@/*`)
rather than long relative paths.

## Conventions

- Import Zod from `zod/v4`.
- TypeScript strict mode; keep `bun run typecheck` at zero errors.
- **Tools return data, never UI.** Rendering belongs in `src/tui/`.
- Naming: PascalCase for files exporting a component or class-like tool
  (`CalculatorTool.ts`, `Prompt.tsx`); camelCase otherwise (`registry.ts`).
  Directories are lowercase.
- Write tests under `test/`, mirroring the `src/` path, using `bun:test`. Prefer
  TDD: write the failing test first.
- Keep commits focused; conventional-commit prefixes (`feat:`, `fix:`, `docs:`,
  `chore:`, `refactor:`) are encouraged.

## Adding a Tool

1. Copy `src/core/tools/builtin/CalculatorTool.ts` as a template.
2. Define a Zod input schema and implement `call(input, ctx)` returning
   `{ output, title?, isError? }`. Set `isReadOnly`/`isDestructive` honestly —
   they default to `false` (fail-closed) and drive the permission check.
3. Add a test under `test/core/tools/`.
4. Register the tool in a `ToolRegistry` (`src/core/tools/registry.ts`).

## Adding a Skill

Create a directory with a `SKILL.md`:

```markdown
---
name: my-skill
description: One line describing when to use this skill
---

The skill body — instructions the assistant follows when the skill applies.
```

Bundled skills live under `src/extensions/skills/bundled/`. See `market-brief`.

## Adding a Slash Command

Implement the `SlashCommand` interface and register it in a `CommandRegistry`.
See `src/extensions/commands/builtin/help.ts`.

## Adding an Agent

Create a `<name>.md` with frontmatter `name`/`description` (optional `model`) and
a body that is the agent's system prompt. See
`src/extensions/agents/builtin/analyst.md`.

## Authoring a Plugin

Copy `src/extensions/plugins/examples/quantcept-sample/`. A plugin is a directory
with a `quantcept-plugin.json` manifest and any of `skills/`, `commands/*.md`,
`agents/*.md`, `hooks/hooks.json`, and MCP servers (inline or `.mcp.json`). Claude
Code (`.claude-plugin/plugin.json`) and Gemini (`gemini-extension.json`) plugins
load through the same adapters. See `src/extensions/plugins/examples/README.md`.

## Releasing (maintainers)

The npm package's `bin` is a zero-dep launcher that resolves a platform-specific
compiled binary. At publish time, CI builds the per-platform binaries
(`bun run script/build.ts` without `--single` for the full matrix), publishes each
as its own package, and adds them to the main package's `optionalDependencies`.
These optional deps are intentionally NOT committed to the repo, because the
platform packages do not exist on npm until published.

## Pull Requests

- Ensure typecheck, lint, test, and build all pass locally.
- Keep PRs scoped to one logical change.
- Describe the "why," not just the "what."
