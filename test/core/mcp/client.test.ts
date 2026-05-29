import { describe, expect, test } from "bun:test"
import { McpClient } from "@core/mcp/client"

function fakeSdk(opts: { tools?: any[]; callResult?: any } = {}) {
  return {
    connect: async () => {},
    listTools: async () => ({ tools: opts.tools ?? [] }),
    callTool: async (_req: { name: string; arguments: unknown }) =>
      opts.callResult ?? { content: [{ type: "text", text: "hello" }], isError: false },
    close: async () => {},
  }
}

describe("McpClient", () => {
  test("listTools returns the server's tool defs", async () => {
    const c = new McpClient(
      "fs",
      { command: "x", args: [], enabled: true, timeout: 1000 },
      () => fakeSdk({ tools: [{ name: "read", inputSchema: { type: "object" } }] }) as any,
    )
    await c.connect()
    const tools = await c.listTools()
    expect(tools[0].name).toBe("read")
  })

  test("callTool joins text content and reports isError", async () => {
    const c = new McpClient(
      "fs",
      { command: "x", args: [], enabled: true, timeout: 1000 },
      () => fakeSdk({ callResult: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }], isError: true } }) as any,
    )
    await c.connect()
    const r = await c.callTool("read", { path: "p" })
    expect(r.output).toBe("a\nb")
    expect(r.isError).toBe(true)
  })

  test("closes the client if connect fails (no leak)", async () => {
    let closed = false
    const failing = {
      connect: async () => {
        throw new Error("connect boom")
      },
      listTools: async () => ({ tools: [] }),
      callTool: async () => ({ content: [], isError: false }),
      close: async () => {
        closed = true
      },
    }
    const c = new McpClient("fs", { command: "x", args: [], enabled: true, timeout: 1000 }, () => failing as any)
    await expect(c.connect()).rejects.toThrow("connect boom")
    expect(closed).toBe(true)
  })
})
