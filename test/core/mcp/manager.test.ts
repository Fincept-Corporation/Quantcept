import { describe, expect, test } from "bun:test"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import { McpAuthStore } from "@core/mcp/auth/store"
import { McpManager } from "@core/mcp/manager"
import type { McpServer } from "@core/mcp/config"
import { ToolRegistry } from "@core/tools/registry"
import fs from "fs"
import os from "os"
import path from "path"

const stdio = (over: Partial<any> = {}): McpServer =>
  ({ type: "stdio", command: "x", args: [], enabled: true, timeout: 1000, ...over }) as McpServer

const oauth = (over: Partial<any> = {}): McpServer =>
  ({
    type: "http",
    url: "https://x/mcp",
    transport: "auto",
    enabled: true,
    timeout: 1000,
    auth: { type: "oauth" },
    ...over,
  }) as McpServer

function tmpStore(): McpAuthStore {
  return new McpAuthStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-mgr-")), "mcp-auth.json"))
}

function fakeClientFactory(behaviour: Record<string, { tools?: any[]; failConnect?: boolean; unauthorizedUntilFinish?: boolean }>) {
  const closed: string[] = []
  const factory = (serverName: string) => {
    const b = behaviour[serverName] ?? {}
    let finished = false
    return {
      async connect() {
        if (b.unauthorizedUntilFinish && !finished) throw new UnauthorizedError("need auth")
        if (b.failConnect) throw new Error("connect failed")
      },
      async finishAuth() {
        finished = true
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

function fakeLoopback() {
  return { redirectUri: "http://127.0.0.1:5555/callback", waitForCode: async () => "code-123", close() {} }
}

describe("McpManager (stdio / open http)", () => {
  test("registers all enabled servers' tools, namespaced", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({
      fs: { tools: [{ name: "read", inputSchema: { type: "object" } }] },
      git: { tools: [{ name: "log", inputSchema: { type: "object" } }] },
    })
    const mgr = new McpManager(factory)
    await mgr.start({ servers: { fs: stdio(), git: stdio() } }, reg)
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
    await mgr.start({ servers: { bad: stdio(), ok: stdio() } }, reg)
    expect(reg.get("mcp__ok__t")).toBeDefined()
    expect(mgr.status().find((s) => s.name === "bad")?.state).toBe("failed")
  })

  test("skips disabled servers", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({ off: { tools: [{ name: "t", inputSchema: {} }] } })
    const mgr = new McpManager(factory)
    await mgr.start({ servers: { off: stdio({ enabled: false }) } }, reg)
    expect(reg.get("mcp__off__t")).toBeUndefined()
    expect(mgr.status().find((s) => s.name === "off")?.state).toBe("disabled")
  })

  test("stop() closes every connected client", async () => {
    const reg = new ToolRegistry()
    const { factory, closed } = fakeClientFactory({ fs: { tools: [] } })
    const mgr = new McpManager(factory)
    await mgr.start({ servers: { fs: stdio() } }, reg)
    await mgr.stop()
    expect(closed).toContain("fs")
  })
})

describe("McpManager (OAuth)", () => {
  test("an oauth server without a stored token is needs-auth and registers no tools", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({ remote: { tools: [{ name: "t", inputSchema: {} }] } })
    const mgr = new McpManager({ makeClient: factory, store: tmpStore() })
    await mgr.start({ servers: { remote: oauth() } }, reg)
    expect(mgr.status().find((s) => s.name === "remote")?.state).toBe("needs-auth")
    expect(reg.get("mcp__remote__t")).toBeUndefined()
  })

  test("an oauth server with a stored token connects silently and registers tools", async () => {
    const reg = new ToolRegistry()
    const store = tmpStore()
    store.setTokens("remote", { access_token: "at", token_type: "Bearer" } as any)
    const { factory } = fakeClientFactory({ remote: { tools: [{ name: "t", inputSchema: {} }] } })
    const mgr = new McpManager({ makeClient: factory, store })
    await mgr.start({ servers: { remote: oauth() } }, reg)
    expect(mgr.status().find((s) => s.name === "remote")?.state).toBe("connected")
    expect(reg.get("mcp__remote__t")).toBeDefined()
  })

  test("authenticate() runs the browser flow, finishes auth, and registers tools", async () => {
    const reg = new ToolRegistry()
    let opened = ""
    const { factory } = fakeClientFactory({
      remote: { unauthorizedUntilFinish: true, tools: [{ name: "search", inputSchema: {} }] },
    })
    const mgr = new McpManager({
      makeClient: factory,
      store: tmpStore(),
      startLoopback: () => fakeLoopback() as any,
      openBrowser: async (url) => {
        opened = url
        return true
      },
    })
    await mgr.start({ servers: { remote: oauth() } }, reg)
    expect(reg.get("mcp__remote__search")).toBeUndefined() // needs-auth at first

    const res = await mgr.authenticate("remote")
    expect(res.ok).toBe(true)
    expect(reg.get("mcp__remote__search")).toBeDefined()
    expect(mgr.status().find((s) => s.name === "remote")?.state).toBe("connected")
  })

  test("authenticate() on an unknown / non-oauth server returns an error", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({ fs: { tools: [] } })
    const mgr = new McpManager({ makeClient: factory, store: tmpStore() })
    await mgr.start({ servers: { fs: stdio() } }, reg)
    expect((await mgr.authenticate("nope")).ok).toBe(false)
    expect((await mgr.authenticate("fs")).ok).toBe(false)
  })

  test("logout() unregisters tools, clears the store, and returns to needs-auth", async () => {
    const reg = new ToolRegistry()
    const store = tmpStore()
    store.setTokens("remote", { access_token: "at", token_type: "Bearer" } as any)
    const { factory } = fakeClientFactory({ remote: { tools: [{ name: "t", inputSchema: {} }] } })
    const mgr = new McpManager({ makeClient: factory, store })
    await mgr.start({ servers: { remote: oauth() } }, reg)
    expect(reg.get("mcp__remote__t")).toBeDefined()

    const res = await mgr.logout("remote")
    expect(res.ok).toBe(true)
    expect(reg.get("mcp__remote__t")).toBeUndefined()
    expect(store.get("remote")).toBeUndefined()
    expect(mgr.status().find((s) => s.name === "remote")?.state).toBe("needs-auth")
  })

  test("status() reports type, transport, state, and tool count", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({ fs: { tools: [{ name: "read", inputSchema: {} }] } })
    const mgr = new McpManager({ makeClient: factory, store: tmpStore() })
    await mgr.start({ servers: { fs: stdio(), remote: oauth() } }, reg)
    const fsStatus = mgr.status().find((s) => s.name === "fs")
    const remoteStatus = mgr.status().find((s) => s.name === "remote")
    expect(fsStatus).toEqual({ name: "fs", type: "stdio", transport: undefined, state: "connected", toolCount: 1 })
    expect(remoteStatus?.type).toBe("http")
    expect(remoteStatus?.transport).toBe("auto")
    expect(remoteStatus?.state).toBe("needs-auth")
  })
})

describe("McpManager.addServer / removeServer", () => {
  test("addServer connects and registers a server's tools live", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({ live: { tools: [{ name: "go", inputSchema: {} }] } })
    const mgr = new McpManager({ makeClient: factory, store: tmpStore() })
    await mgr.start({ servers: {} }, reg)
    expect(reg.get("mcp__live__go")).toBeUndefined()

    const res = await mgr.addServer("live", stdio())
    expect(res.ok).toBe(true)
    expect(res.toolCount).toBe(1)
    expect(reg.get("mcp__live__go")).toBeDefined()
    expect(mgr.status().find((s) => s.name === "live")?.state).toBe("connected")
  })

  test("addServer rejects a duplicate name without touching the existing server", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({ dup: { tools: [{ name: "t", inputSchema: {} }] } })
    const mgr = new McpManager({ makeClient: factory, store: tmpStore() })
    await mgr.start({ servers: { dup: stdio() } }, reg)
    expect(reg.get("mcp__dup__t")).toBeDefined()

    const res = await mgr.addServer("dup", stdio())
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/already exists/)
    expect(reg.get("mcp__dup__t")).toBeDefined()
  })

  test("addServer drops a server that fails to connect (not left half-added)", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({ broken: { failConnect: true } })
    const mgr = new McpManager({ makeClient: factory, store: tmpStore() })
    await mgr.start({ servers: {} }, reg)

    const res = await mgr.addServer("broken", stdio())
    expect(res.ok).toBe(false)
    expect(mgr.status().find((s) => s.name === "broken")).toBeUndefined()
  })

  test("addServer for an oauth server lands in needs-auth and registers no tools", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({ remote: { tools: [{ name: "t", inputSchema: {} }] } })
    const mgr = new McpManager({ makeClient: factory, store: tmpStore() })
    await mgr.start({ servers: {} }, reg)

    const res = await mgr.addServer("remote", oauth())
    expect(res.ok).toBe(true)
    expect(res.state).toBe("needs-auth")
    expect(reg.get("mcp__remote__t")).toBeUndefined()
  })

  test("removeServer unregisters tools, drops the record, and clears stored creds", async () => {
    const reg = new ToolRegistry()
    const store = tmpStore()
    store.setTokens("live", { access_token: "at", token_type: "Bearer" } as any)
    const { factory } = fakeClientFactory({ live: { tools: [{ name: "go", inputSchema: {} }] } })
    const mgr = new McpManager({ makeClient: factory, store })
    await mgr.start({ servers: { live: stdio() } }, reg)
    expect(reg.get("mcp__live__go")).toBeDefined()

    const res = await mgr.removeServer("live")
    expect(res.ok).toBe(true)
    expect(reg.get("mcp__live__go")).toBeUndefined()
    expect(mgr.status().find((s) => s.name === "live")).toBeUndefined()
    expect(store.get("live")).toBeUndefined()
  })

  test("removeServer on an unknown name returns an error", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({})
    const mgr = new McpManager({ makeClient: factory, store: tmpStore() })
    await mgr.start({ servers: {} }, reg)
    expect((await mgr.removeServer("ghost")).ok).toBe(false)
  })

  test("a removed name can be added again", async () => {
    const reg = new ToolRegistry()
    const { factory } = fakeClientFactory({ live: { tools: [{ name: "go", inputSchema: {} }] } })
    const mgr = new McpManager({ makeClient: factory, store: tmpStore() })
    await mgr.start({ servers: { live: stdio() } }, reg)
    await mgr.removeServer("live")
    const res = await mgr.addServer("live", stdio())
    expect(res.ok).toBe(true)
    expect(reg.get("mcp__live__go")).toBeDefined()
  })
})
