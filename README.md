# Quantcept

**AI-powered finance terminal** — analyze documents, crunch numbers, and query markets from your terminal.

Quantcept is an interactive CLI that connects to any OpenAI-compatible LLM API and gives it tools for financial analysis: PDF parsing, CSV analysis, calculations (NPV, IRR, compound interest), web fetching, file operations, and shell access — all with a permission system that keeps you in control.

<p align="center">
  <img src="demo.gif" alt="Quantcept demo" width="700" />
</p>

## Install

```bash
npm install -g quantcept
```

Or run without installing:

```bash
npx quantcept
bunx quantcept
```

### Requirements

- Node.js 18+ or [Bun](https://bun.sh)
- Python 3 with `pdfplumber` and `pandas` *(optional, for PDF/CSV analysis)*

## Setup

Set your LLM provider credentials:

```bash
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://your-llm-provider.com/api"
export LLM_MODEL="your-model"   # optional
```

Or create a `~/.quantcept/settings.json`:

```json
{
  "apiKey": "your-api-key",
  "baseUrl": "https://your-llm-provider.com/api",
  "model": "your-model"
}
```

## Usage

```bash
quantcept                       # Start the terminal
quantcept --model gpt-4o         # Use a specific model
quantcept --resume <session-id>  # Resume a previous session
```

### Commands

Type these inside the Quantcept terminal:

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/analyze <file>` | Analyze a financial document |
| `/model [name]` | Show or switch model |
| `/sessions` | List saved sessions |
| `/export <file> [format]` | Export conversation (md, json, txt) |
| `/cost` | Show token usage |
| `/tasks` | List tasks |
| `/doctor` | Check system health |
| `/thinking` | Toggle thinking mode display |
| `/clear` | Clear chat history |
| `/exit` | Exit |

### Tools

The LLM can use these tools during a conversation:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `edit_file` | Edit files with search/replace |
| `write_file` | Write new files |
| `glob` | Find files by pattern |
| `grep` | Search file contents |
| `shell` | Execute shell commands |
| `calculator` | NPV, IRR, compound interest, % change |
| `parse_pdf` | Extract text and tables from PDFs |
| `analyze_csv` | Statistical analysis of CSV files |
| `web_fetch` | Fetch URL content |
| `web_search` | Search the web |

### Permissions

Tools that modify files or run commands require your approval. You can pre-approve tools:

```
/allow shell
/allow write_file
```

Or configure in `~/.quantcept/settings.json`:

```json
{
  "permissions": [
    { "tool": "read_file", "behavior": "allow" },
    { "tool": "shell", "behavior": "ask" }
  ]
}
```

## Configuration

Quantcept loads settings from two locations (project overrides user):

1. **User**: `~/.quantcept/settings.json`
2. **Project**: `.quantcept/settings.json`

Environment variables (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`) override both.

### Hooks

Run commands before or after tool execution:

```json
{
  "hooks": [
    {
      "event": "pre_tool",
      "tool": "shell",
      "command": "echo 'Running shell tool...'"
    }
  ]
}
```

### MCP Servers

Connect external tool servers via [Model Context Protocol](https://modelcontextprotocol.io):

```json
{
  "mcpServers": [
    {
      "name": "my-server",
      "command": "npx",
      "args": ["-y", "my-mcp-server"],
      "env": { "API_KEY": "..." }
    }
  ]
}
```

### Plugins

Install plugins from the filesystem or marketplace:

```
~/.quantcept/plugins/installed/<plugin-name>/plugin.json
```

### Custom Keybindings

Override default shortcuts in `~/.quantcept/keybindings.json`:

```json
[
  { "key": "c", "ctrl": true, "action": "exit", "description": "Exit" },
  { "key": "l", "ctrl": true, "action": "clear", "description": "Clear chat" }
]
```

## Feedback & Issues

Report bugs and request features at [GitHub Issues](https://github.com/Fincept-Corporation/Quantcept/issues).

## License

Apache License 2.0 — see [LICENSE.md](LICENSE.md).
