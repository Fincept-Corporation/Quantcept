import { describe, expect, test } from "bun:test"
import { bridgeMcpTool } from "@core/mcp/bridge"
import type { McpToolDef } from "@core/mcp/types"

function fakeClient(captured: { name?: string; args?: unknown }) {
  return {
    async callTool(bareName: string, args: unknown) {
      captured.name = bareName
      captured.args = args
      return { output: "RESULT", isError: false }
    },
  } as any
}

describe("bridgeMcpTool", () => {
  const def: McpToolDef = {
    name: "read file",
    description: "Reads",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
    annotations: { readOnlyHint: true, destructiveHint: false },
  }

  test("namespaces the name and normalizes non-alphanumerics", () => {
    const t = bridgeMcpTool("my fs", def, fakeClient({}))
    expect(t.name).toBe("mcp__my_fs__read_file")
  })

  test("carries the server's JSON schema as inputJSONSchema", () => {
    const t = bridgeMcpTool("fs", def, fakeClient({}))
    expect(t.inputJSONSchema).toEqual(def.inputSchema)
  })

  test("maps annotations to isReadOnly/isDestructive", () => {
    const t = bridgeMcpTool("fs", def, fakeClient({}))
    expect(t.isReadOnly({})).toBe(true)
    expect(t.isDestructive({})).toBe(false)
  })

  test("call() sends the BARE tool name and propagates output/isError", async () => {
    const captured: { name?: string; args?: unknown } = {}
    const t = bridgeMcpTool("fs", def, fakeClient(captured))
    const r = await t.call({ path: "p" }, { abort: new AbortController().signal, cwd: "/" })
    expect(captured.name).toBe("read file")
    expect(captured.args).toEqual({ path: "p" })
    expect(r.output).toBe("RESULT")
    expect(r.isError).toBe(false)
  })

  test("missing annotations default to not-readonly, not-destructive", () => {
    const t = bridgeMcpTool("fs", { name: "x", inputSchema: { type: "object" } }, fakeClient({}))
    expect(t.isReadOnly({})).toBe(false)
    expect(t.isDestructive({})).toBe(false)
  })
})
