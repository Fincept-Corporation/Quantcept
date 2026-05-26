<p align="center">
  <img src="assets/banner.png" alt="Quantcept" width="600" />
</p>

<h1 align="center">Quantcept</h1>

<p align="center">
  <strong>AI-powered finance terminal</strong><br>
  Analyze documents. Crunch numbers. Query markets. All from your terminal.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/quantcept"><img src="https://img.shields.io/npm/v/quantcept?color=00D4AA&label=npm" alt="npm version" /></a>
  <a href="https://github.com/Fincept-Corporation/Quantcept/blob/main/LICENSE.md"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License" /></a>
  <a href="https://github.com/Fincept-Corporation/Quantcept/issues"><img src="https://img.shields.io/github/issues/Fincept-Corporation/Quantcept" alt="Issues" /></a>
</p>

---

Quantcept is an interactive CLI that connects to any LLM provider and equips it with tools for financial analysis — PDF parsing, CSV analysis, financial calculations (NPV, IRR, compound interest), web fetching, file operations, and shell access. A built-in permission system ensures every action requires your approval.

<p align="center">
  <img src="assets/demo.gif" alt="Quantcept demo" width="700" />
</p>

## Installation

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/Fincept-Corporation/Quantcept/main/scripts/install.sh | bash
```

### Windows

```powershell
irm https://raw.githubusercontent.com/Fincept-Corporation/Quantcept/main/scripts/install.ps1 | iex
```

### Homebrew (macOS / Linux)

```bash
brew tap Fincept-Corporation/quantcept
brew install quantcept
```

### WinGet (Windows)

```powershell
winget install FinceptCorporation.Quantcept
```

### npm

```bash
npm install -g quantcept
```

> You can also run without installing: `npx quantcept` or `bunx quantcept`

### Requirements

- Node.js 18+ or [Bun](https://bun.sh)
- Python 3 with `pdfplumber` and `pandas` *(optional — only needed for PDF/CSV analysis)*

---

## Quick Start

**1. Set your LLM credentials**

```bash
# macOS / Linux
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://api.your-llm-provider.com"
export LLM_MODEL="your-model"   # optional

# Windows (PowerShell)
$env:LLM_API_KEY = "your-api-key"
$env:LLM_BASE_URL = "https://api.your-llm-provider.com"
$env:LLM_MODEL = "your-model"
```

Or save them permanently in `~/.quantcept/settings.json`:

```json
{
  "apiKey": "your-api-key",
  "baseUrl": "https://api.your-llm-provider.com",
  "model": "your-model"
}
```

**2. Launch**

```bash
quantcept
```

**3. Start asking**

```
> Analyze the Q4 earnings report in ./reports/q4-2025.pdf
> Calculate NPV of [-100000, 25000, 35000, 45000, 50000] at 8% discount rate
> Compare revenue trends across all CSVs in ./data/
```

---

## What It Can Do

Quantcept gives your LLM access to a suite of tools it can invoke during conversation:

| Tool | What it does |
|------|-------------|
| `read_file` | Read file contents |
| `edit_file` | Edit files with search/replace |
| `write_file` | Create new files |
| `glob` | Find files by pattern |
| `grep` | Search file contents with regex |
| `shell` | Execute shell commands |
| `calculator` | NPV, IRR, compound interest, % change |
| `parse_pdf` | Extract text and tables from PDFs |
| `analyze_csv` | Statistical analysis of CSV files |
| `web_fetch` | Fetch content from URLs |
| `web_search` | Search the web |

Every tool invocation shows you what's about to happen and asks for permission before executing.

---

## Commands

Type these inside the Quantcept terminal:

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/analyze <file>` | Analyze a financial document |
| `/model [name]` | Show or switch the LLM model |
| `/sessions` | List saved sessions |
| `/export <file> [md\|json\|txt]` | Export conversation |
| `/cost` | Show token usage and request count |
| `/tasks` | List and manage tasks |
| `/doctor` | Check system health and configuration |
| `/thinking` | Toggle thinking mode display |
| `/tools` | List available tools |
| `/plugins` | List installed plugins |
| `/skills` | List available skills |
| `/keybindings` | Show keyboard shortcuts |
| `/clear` | Clear chat history |
| `/exit` | Exit Quantcept |

---

## Permissions

Tools that modify your system (write files, run shell commands) require explicit approval. You control this per-tool:

```
/allow read_file       # Always allow
/deny shell            # Always block
```

Or configure rules in `~/.quantcept/settings.json`:

```json
{
  "permissions": [
    { "tool": "read_file", "behavior": "allow" },
    { "tool": "glob", "behavior": "allow" },
    { "tool": "grep", "behavior": "allow" },
    { "tool": "calculator", "behavior": "allow" },
    { "tool": "shell", "behavior": "ask" },
    { "tool": "write_file", "behavior": "ask" }
  ]
}
```

Read-only tools are allowed by default. Everything else prompts you.

---

## Configuration

Settings are loaded from two layers (project overrides user):

| Scope | Location |
|-------|----------|
| User | `~/.quantcept/settings.json` |
| Project | `.quantcept/settings.json` |

Environment variables (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`) take highest priority.

### Hooks

Execute commands before or after tool runs:

```json
{
  "hooks": [
    {
      "event": "pre_tool",
      "tool": "shell",
      "command": "echo 'About to run shell command...'"
    },
    {
      "event": "post_tool",
      "command": "echo 'Tool finished.'"
    }
  ]
}
```

Supported events: `pre_tool`, `post_tool`, `on_start`, `on_exit`, `on_error`.

### MCP Servers

Extend Quantcept with external tool servers via [Model Context Protocol](https://modelcontextprotocol.io):

```json
{
  "mcpServers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data"],
      "enabled": true
    }
  ]
}
```

### Plugins

Install plugins to add new tools, skills, and capabilities:

```
~/.quantcept/plugins/installed/<plugin-name>/plugin.json
```

List installed plugins with `/plugins` inside the terminal.

### Skills

Skills are prompt-driven capabilities that can be bundled, loaded from the filesystem, or contributed by plugins:

```
~/.quantcept/skills/<skill-name>/skill.json
~/.quantcept/skills/<skill-name>/prompt.md
```

List skills with `/skills` inside the terminal.

### Keybindings

Customize keyboard shortcuts in `~/.quantcept/keybindings.json`:

```json
[
  { "key": "c", "ctrl": true, "action": "exit", "description": "Exit" },
  { "key": "l", "ctrl": true, "action": "clear", "description": "Clear chat" },
  { "key": "k", "ctrl": true, "action": "compact", "description": "Compact conversation" },
  { "key": "e", "ctrl": true, "action": "export", "description": "Quick export" },
  { "key": "t", "ctrl": true, "action": "tasks", "description": "Show tasks" }
]
```

---

## Session Management

Quantcept can persist conversations and resume them later:

```bash
quantcept --resume <session-id>
```

View saved sessions with `/sessions`. Export any conversation with `/export`.

---

## Examples

See the [`examples/`](examples/) directory for detailed walkthroughs:

- [Basic Usage](examples/basic-usage.md) — PDF analysis, CSV queries, financial calculations
- [Configuration](examples/configuration.md) — Settings, MCP servers, permission rules

---

## Troubleshooting

Run `/doctor` inside Quantcept to check your setup:

```
System health:
  ✓ LLM_API_KEY set
  ✓ LLM_BASE_URL: https://api.your-provider.com
  ✓ LLM_MODEL: your-model
  ✓ Python available
  ✓ Git available
  ✓ 11 tools loaded
  ✓ 2 skills loaded
  ✓ 0 plugins installed
```

Common issues:

| Problem | Fix |
|---------|-----|
| `LLM_API_KEY missing` | Set the `LLM_API_KEY` environment variable |
| `Python not found` | Install Python 3 for PDF/CSV tools, or skip those features |
| `Tool execution failed` | Check `/doctor` output and verify permissions |

---

## Security

- API keys are never logged or transmitted beyond your configured LLM provider
- All tool executions require explicit permission
- Credentials should be set via environment variables or user-level config, never in project-level config for shared repos

Report security vulnerabilities privately — see [SECURITY.md](SECURITY.md).

---

## Feedback & Issues

- Report bugs: [GitHub Issues](https://github.com/Fincept-Corporation/Quantcept/issues)
- Request features: [GitHub Issues](https://github.com/Fincept-Corporation/Quantcept/issues)

---

## License

Apache License 2.0 — see [LICENSE.md](LICENSE.md).

Built by [Fincept Corporation](https://github.com/Fincept-Corporation).
