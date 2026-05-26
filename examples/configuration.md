# Configuration Examples

## Minimal setup

```json
{
  "apiKey": "sk-...",
  "baseUrl": "https://api.your-llm-provider.com"
}
```

## Full configuration

```json
{
  "model": "your-model-name",
  "apiKey": "sk-...",
  "baseUrl": "https://api.your-llm-provider.com",
  "theme": "dark",
  "permissions": [
    { "tool": "read_file", "behavior": "allow" },
    { "tool": "glob", "behavior": "allow" },
    { "tool": "grep", "behavior": "allow" },
    { "tool": "calculator", "behavior": "allow" },
    { "tool": "shell", "behavior": "ask" },
    { "tool": "write_file", "behavior": "ask" }
  ],
  "hooks": [
    {
      "event": "on_start",
      "command": "echo 'Quantcept started'"
    }
  ],
  "session": {
    "persist": true,
    "maxHistory": 50
  }
}
```

## MCP server integration

```json
{
  "mcpServers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    },
    {
      "name": "postgres",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://localhost/mydb"
      }
    }
  ]
}
```
