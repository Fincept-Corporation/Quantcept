import { describe, expect, test } from "bun:test"
import { McpAuthStore } from "@core/mcp/auth/store"
import { McpClient } from "@core/mcp/client"
import { McpManager } from "@core/mcp/manager"
import { ToolRegistry } from "@core/tools/registry"
import fs from "node:fs"
import { EventEmitter } from "node:events"
import os from "node:os"
import path from "node:path"

const stdioCfg = { type: "stdio", command: "uvx", args: [], enabled: true, timeout: 1000 } as never

// A fake stdio transport (start() + a stderr EventEmitter) plus a fake low-level client whose
// connect() spawns (calls transport.start()), lets the child print to stderr, then fails the
// handshake — the exact shape of a server that crashes on startup (e.g. a missing env var).
function crashingPair(stderrText: string | null) {
  const stderr = new EventEmitter()
  const transport = { kind: "stdio", stderr, async start() {} }
  const client = {
    async connect(t: { start(): Promise<void> }) {
      await t.start() // wrapper attaches its stderr listener once this resolves
      if (stderrText !== null) stderr.emit("data", Buffer.from(stderrText))
      throw new Error("MCP error -32000: Connection closed")
    },
    async listTools() {
      return { tools: [] }
    },
    async callTool() {
      return { content: [], isError: false }
    },
    async close() {},
  }
  return { transport, client }
}

describe("McpClient stdio connect failure surfaces child stderr", () => {
  test("the child's stderr is folded into the thrown error", async () => {
    const { transport, client } = crashingPair("ValueError: SEC_EDGAR_USER_AGENT environment variable is not set.")
    const c = new McpClient(
      "sec-edgar",
      stdioCfg,
      () => client as never,
      () => transport as never,
    )
    await expect(c.connect()).rejects.toThrow(/SEC_EDGAR_USER_AGENT/)
  })

  test("a failure with no stderr keeps the original error message", async () => {
    const { transport, client } = crashingPair(null)
    const c = new McpClient(
      "x",
      stdioCfg,
      () => client as never,
      () => transport as never,
    )
    await expect(c.connect()).rejects.toThrow(/Connection closed/)
  })
})

describe("McpManager.addServer surfaces the failure detail", () => {
  test("the connect-error message reaches the AddResult", async () => {
    const reg = new ToolRegistry()
    const store = new McpAuthStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-err-")), "auth.json"))
    const factory = () =>
      ({
        async connect() {
          throw new Error("server stderr: SEC_EDGAR_USER_AGENT environment variable is not set.")
        },
        async listTools() {
          return []
        },
        async callTool() {
          return { output: "", isError: false }
        },
        async close() {},
      }) as never
    const mgr = new McpManager({ makeClient: factory, store })
    await mgr.start({ servers: {} }, reg)

    const res = await mgr.addServer("sec-edgar", stdioCfg)
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/SEC_EDGAR_USER_AGENT/)
  })
})
