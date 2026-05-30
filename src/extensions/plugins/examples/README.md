# Example plugins & marketplace

These are runnable references for Quantcept's plugin system. The engine lives in
`src/core/plugins` (loader + adapters + install + marketplace) and `src/core/hooks` (hook runtime).

## `quantcept-sample/` — one plugin, every surface

A neutral-format plugin that exercises **all five** contribution surfaces:

| Surface | File | What it does |
|---------|------|--------------|
| Skill   | `skills/portfolio-tip/SKILL.md` | adds the `quantcept-sample:portfolio-tip` skill |
| Command | `commands/greet.md`             | adds the `/quantcept-sample:greet` slash command |
| Agent   | `agents/quant-helper.md`        | adds the `quantcept-sample:quant-helper` persona |
| Hook    | `hooks/hooks.json`              | runs a `SessionStart` command hook |
| MCP     | `mcp/echo-server.mjs`           | a dependency-free stdio MCP server exposing a `ping` tool |

The MCP server is deliberately dependency-free (plain JSON-RPC over stdio) so it runs even from the
install cache, where `node_modules` is not present.

## `local-marketplace/` — a catalog

`quantcept-marketplace.json` lists `quantcept-sample` by relative path. It demonstrates the neutral
marketplace format. Claude Code (`.claude-plugin/marketplace.json`) and gemini (`extensions.json`)
catalogs are consumed by the same client via adapters.

## Try it

From the running app:

```
/plugin marketplace add <abs-path-to>/src/extensions/plugins/examples/local-marketplace
/plugin install quantcept-sample@quantcept-examples
# skills & commands appear immediately; MCP servers load on the next session start
```

Or headless:

```
quantcept plugin marketplace add <path>/local-marketplace
quantcept plugin install quantcept-sample@quantcept-examples
quantcept plugin list
```

## Cross-compatibility

The loader auto-detects three on-disk formats and adapts them to one neutral model:

- **neutral** — `quantcept-plugin.json` (this example)
- **Claude Code** — `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`
- **gemini-cli** — `gemini-extension.json` + `commands/*.toml`

So a marketplace can list plugins authored for any of these ecosystems and Quantcept will install and
run them. `${CLAUDE_PLUGIN_ROOT}` / `${extensionPath}` / `${PLUGIN_ROOT}` and `${ENV}` all interpolate.
