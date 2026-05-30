import { describe, expect, test } from "bun:test"
import { McpConfigSchema, McpHttpServerSchema, McpServerSchema, McpStdioServerSchema } from "@core/mcp/config"

describe("McpStdioServerSchema", () => {
  test("applies defaults for args/enabled/timeout", () => {
    const s = McpStdioServerSchema.parse({ command: "node" })
    expect(s.args).toEqual([])
    expect(s.enabled).toBe(true)
    expect(s.timeout).toBe(30000)
    expect(s.type).toBe("stdio")
  })
  test("rejects an empty command", () => {
    expect(() => McpStdioServerSchema.parse({ command: "" })).toThrow()
  })
})

describe("McpHttpServerSchema", () => {
  test("parses an http server with transport default 'auto'", () => {
    const s = McpHttpServerSchema.parse({ type: "http", url: "https://x/mcp" })
    expect(s.type).toBe("http")
    expect(s.transport).toBe("auto")
    expect(s.enabled).toBe(true)
    expect(s.timeout).toBe(30000)
  })
  test("rejects an http server without a url", () => {
    expect(() => McpHttpServerSchema.parse({ type: "http" })).toThrow()
  })
  test("keeps headers and an explicit transport", () => {
    const s = McpHttpServerSchema.parse({
      type: "http",
      url: "https://x/mcp",
      headers: { Authorization: "Bearer ${TOK}" },
      transport: "sse",
    })
    expect(s.headers).toEqual({ Authorization: "Bearer ${TOK}" })
    expect(s.transport).toBe("sse")
  })
  test("accepts an oauth auth block", () => {
    const s = McpHttpServerSchema.parse({
      type: "http",
      url: "https://x/mcp",
      auth: { type: "oauth", scopes: ["read"] },
    })
    expect(s.auth?.type).toBe("oauth")
    expect(s.auth?.scopes).toEqual(["read"])
  })
})

describe("McpServerSchema (union)", () => {
  test("a legacy entry without 'type' parses as stdio", () => {
    const s = McpServerSchema.parse({ command: "npx", args: ["-y", "srv"] })
    expect(s.type).toBe("stdio")
    if (s.type === "stdio") expect(s.command).toBe("npx")
  })
  test("an http entry parses as http", () => {
    const s = McpServerSchema.parse({ type: "http", url: "https://x/mcp" })
    expect(s.type).toBe("http")
  })
})

describe("McpConfigSchema", () => {
  test("defaults to empty servers", () => {
    expect(McpConfigSchema.parse(undefined)).toEqual({ servers: {} })
  })
  test("parses a named stdio server (backward compatible)", () => {
    const c = McpConfigSchema.parse({ servers: { fs: { command: "npx", args: ["-y", "server-filesystem", "."] } } })
    const fs = c.servers.fs
    expect(fs.type).toBe("stdio")
    if (fs.type === "stdio") expect(fs.command).toBe("npx")
    expect(fs.timeout).toBe(30000)
  })
  test("parses a mixed map of stdio and http servers", () => {
    const c = McpConfigSchema.parse({
      servers: {
        fs: { command: "npx", args: [] },
        tavily: { type: "http", url: "https://api.tavily.com/mcp", headers: { Authorization: "Bearer ${TAVILY_API_KEY}" } },
      },
    })
    expect(c.servers.fs.type).toBe("stdio")
    expect(c.servers.tavily.type).toBe("http")
    if (c.servers.tavily.type === "http") expect(c.servers.tavily.url).toBe("https://api.tavily.com/mcp")
  })
})
