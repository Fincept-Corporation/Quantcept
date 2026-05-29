import { describe, expect, test } from "bun:test"
import { McpConfigSchema, McpStdioServerSchema } from "@core/mcp/config"

describe("McpStdioServerSchema", () => {
  test("applies defaults for args/enabled/timeout", () => {
    const s = McpStdioServerSchema.parse({ command: "node" })
    expect(s.args).toEqual([])
    expect(s.enabled).toBe(true)
    expect(s.timeout).toBe(30000)
  })
  test("rejects an empty command", () => {
    expect(() => McpStdioServerSchema.parse({ command: "" })).toThrow()
  })
})

describe("McpConfigSchema", () => {
  test("defaults to empty servers", () => {
    expect(McpConfigSchema.parse(undefined)).toEqual({ servers: {} })
  })
  test("parses a named server", () => {
    const c = McpConfigSchema.parse({ servers: { fs: { command: "npx", args: ["-y", "server-filesystem", "."] } } })
    expect(c.servers.fs.command).toBe("npx")
    expect(c.servers.fs.timeout).toBe(30000)
  })
})
