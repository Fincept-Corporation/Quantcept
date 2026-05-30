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

// A client whose connect inspects the (tagged) transport it was handed, records the
// transport kind, and optionally fails for specific kinds. Lets us assert transport
// selection + the streamable→SSE fallback without any real network.
function taggedClient(opts: { failOn?: string[]; tools?: any[] } = {}) {
  const connectedKinds: string[] = []
  const client = {
    connect: async (transport: any) => {
      const kind = transport?.kind ?? "stdio"
      if (opts.failOn?.includes(kind)) throw new Error(`connect failed for ${kind}`)
      connectedKinds.push(kind)
    },
    listTools: async () => ({ tools: opts.tools ?? [] }),
    callTool: async () => ({ content: [], isError: false }),
    close: async () => {},
  }
  return { client, connectedKinds }
}

const makeTransport = (kind: "stdio" | "http" | "sse") => ({ kind }) as any

describe("McpClient (stdio)", () => {
  test("listTools returns the server's tool defs", async () => {
    const c = new McpClient(
      "fs",
      { type: "stdio", command: "x", args: [], enabled: true, timeout: 1000 },
      () => fakeSdk({ tools: [{ name: "read", inputSchema: { type: "object" } }] }) as any,
    )
    await c.connect()
    const tools = await c.listTools()
    expect(tools[0].name).toBe("read")
  })

  test("callTool joins text content and reports isError", async () => {
    const c = new McpClient(
      "fs",
      { type: "stdio", command: "x", args: [], enabled: true, timeout: 1000 },
      () =>
        fakeSdk({
          callResult: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }], isError: true },
        }) as any,
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
    const c = new McpClient(
      "fs",
      { type: "stdio", command: "x", args: [], enabled: true, timeout: 1000 },
      () => failing as any,
    )
    await expect(c.connect()).rejects.toThrow("connect boom")
    expect(closed).toBe(true)
  })
})

describe("McpClient (http transport selection)", () => {
  test("transport 'sse' connects via SSE directly", async () => {
    const { client, connectedKinds } = taggedClient({})
    const c = new McpClient(
      "r",
      { type: "http", url: "https://x/mcp", transport: "sse", enabled: true, timeout: 1000 },
      () => client as any,
      makeTransport,
    )
    await c.connect()
    expect(connectedKinds).toEqual(["sse"])
  })

  test("transport 'http' uses streamable and does NOT fall back", async () => {
    const { client, connectedKinds } = taggedClient({ failOn: ["http"] })
    const c = new McpClient(
      "r",
      { type: "http", url: "https://x/mcp", transport: "http", enabled: true, timeout: 1000 },
      () => client as any,
      makeTransport,
    )
    await expect(c.connect()).rejects.toThrow()
    expect(connectedKinds).toEqual([])
  })

  test("transport 'auto' falls back to SSE when streamable connect fails", async () => {
    const { client, connectedKinds } = taggedClient({
      failOn: ["http"],
      tools: [{ name: "t", inputSchema: { type: "object" } }],
    })
    const c = new McpClient(
      "r",
      { type: "http", url: "https://x/mcp", transport: "auto", enabled: true, timeout: 1000 },
      () => client as any,
      makeTransport,
    )
    await c.connect()
    expect(connectedKinds).toEqual(["sse"])
    const tools = await c.listTools()
    expect(tools[0].name).toBe("t")
  })

  test("transport 'auto' uses streamable when it succeeds (no SSE attempt)", async () => {
    const { client, connectedKinds } = taggedClient({})
    const c = new McpClient(
      "r",
      { type: "http", url: "https://x/mcp", transport: "auto", enabled: true, timeout: 1000 },
      () => client as any,
      makeTransport,
    )
    await c.connect()
    expect(connectedKinds).toEqual(["http"])
  })
})
