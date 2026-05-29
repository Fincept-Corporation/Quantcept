import { describe, expect, test } from "bun:test"
import { McpManager } from "@core/mcp/manager"
import { ToolRegistry } from "@core/tools/registry"

function fakeClientFactory(behaviour: Record<string, { tools?: any[]; failConnect?: boolean }>) {
  const closed: string[] = []
  const factory = (serverName: string) => {
    const b = behaviour[serverName] ?? {}
    return {
      async connect() {
        if (b.failConnect) throw new Error("connect failed")
      },
      async listTools() {
        return b.tools ?? []
      },
      async callTool() {
        return { output: "", isError: false }
      },
      async close() {
        closed.push(serverName)
      },
    } as any
  }
  return { factory, closed }
}

describe("McpManager", () => {
  test("registers all enabled servers' tools, namespaced", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({
      fs: { tools: [{ name: "read", inputSchema: { type: "object" } }] },
      git: { tools: [{ name: "log", inputSchema: { type: "object" } }] },
    })
    const mgr = new McpManager(factory)
    await mgr.start(
      {
        servers: {
          fs: { command: "x", args: [], enabled: true, timeout: 1000 },
          git: { command: "y", args: [], enabled: true, timeout: 1000 },
        },
      },
      reg,
    )
    expect(reg.get("mcp__fs__read")).toBeDefined()
    expect(reg.get("mcp__git__log")).toBeDefined()
  })

  test("a failing server does not block the others", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({
      bad: { failConnect: true },
      ok: { tools: [{ name: "t", inputSchema: { type: "object" } }] },
    })
    const mgr = new McpManager(factory)
    await mgr.start(
      {
        servers: {
          bad: { command: "x", args: [], enabled: true, timeout: 1000 },
          ok: { command: "y", args: [], enabled: true, timeout: 1000 },
        },
      },
      reg,
    )
    expect(reg.get("mcp__ok__t")).toBeDefined()
  })

  test("skips disabled servers", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({ off: { tools: [{ name: "t", inputSchema: {} }] } })
    const mgr = new McpManager(factory)
    await mgr.start({ servers: { off: { command: "x", args: [], enabled: false, timeout: 1000 } } }, reg)
    expect(reg.get("mcp__off__t")).toBeUndefined()
  })

  test("stop() closes every connected client", async () => {
    const reg = new ToolRegistry()
    const { factory, closed } = fakeClientFactory({ fs: { tools: [] } })
    const mgr = new McpManager(factory)
    await mgr.start({ servers: { fs: { command: "x", args: [], enabled: true, timeout: 1000 } } }, reg)
    await mgr.stop()
    expect(closed).toContain("fs")
  })
})
