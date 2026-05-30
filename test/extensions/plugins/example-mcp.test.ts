import { describe, expect, test } from "bun:test"
import { McpClient } from "@core/mcp/client"
import { McpServerSchema } from "@core/mcp/config"
import path from "node:path"

const SERVER = path.join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "src",
  "extensions",
  "plugins",
  "examples",
  "quantcept-sample",
  "mcp",
  "echo-server.mjs",
)

describe("example MCP echo server (stdio, dependency-free)", () => {
  test("connects, lists the ping tool, and returns pong", async () => {
    const config = McpServerSchema.parse({ type: "stdio", command: "bun", args: [SERVER] })
    const client = new McpClient("echo", config)
    try {
      await client.connect()
      const tools = await client.listTools()
      expect(tools.map((t) => t.name)).toContain("ping")
      const r = await client.callTool("ping", { message: "hi" })
      expect(r.output).toContain("pong")
      expect(r.isError).toBe(false)
    } finally {
      await client.close()
    }
  }, 20000)
})
