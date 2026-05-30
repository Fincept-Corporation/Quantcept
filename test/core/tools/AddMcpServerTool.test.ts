import { describe, expect, test } from "bun:test"
import { createAddMcpServerTool } from "@core/tools/builtin/AddMcpServerTool"
import type { AddResult } from "@core/mcp/manager"

interface FakeManager {
  addServer: (name: string, config: unknown) => Promise<AddResult>
}

function fakeManager(result: AddResult, capture: { name?: string; config?: any } = {}): FakeManager {
  return {
    async addServer(name, config) {
      capture.name = name
      capture.config = config
      return result
    },
  }
}

const ctxArg = { abort: new AbortController().signal, cwd: "." }

describe("AddMcpServerTool", () => {
  test("is destructive", () => {
    const tool = createAddMcpServerTool({ manager: fakeManager({ ok: true, message: "" }) as any, cwd: "." })
    expect(tool.isDestructive({} as never)).toBe(true)
    expect(tool.isReadOnly({} as never)).toBe(false)
  })

  test("emits an mcp_add:<name> permission pattern (forces ask even in allow mode)", () => {
    const tool = createAddMcpServerTool({ manager: fakeManager({ ok: true, message: "" }) as any, cwd: "." })
    expect(tool.permissionPatterns?.({ name: "tavily", type: "http", url: "https://x" } as never)).toEqual([
      "mcp_add:tavily",
    ])
  })

  test("rejects an invalid spec without calling the manager", async () => {
    const capture: { name?: string } = {}
    const tool = createAddMcpServerTool({
      manager: fakeManager({ ok: true, message: "should not happen" }, capture) as any,
      cwd: ".",
    })
    // http with no url → schema failure
    const r = await tool.call({ name: "bad", type: "http" } as never, ctxArg)
    expect(r.isError).toBe(true)
    expect(capture.name).toBeUndefined() // manager never called
  })

  test("rejects a missing/empty name", async () => {
    const tool = createAddMcpServerTool({ manager: fakeManager({ ok: true, message: "" }) as any, cwd: "." })
    const r = await tool.call({ name: "  ", type: "stdio", command: "x" } as never, ctxArg)
    expect(r.isError).toBe(true)
  })

  test("a valid stdio spec calls addServer then persists, returning the manager message", async () => {
    const capture: { name?: string; config?: any } = {}
    let persisted: { name?: string; cwd?: string } = {}
    const tool = createAddMcpServerTool({
      manager: fakeManager({ ok: true, message: "Added \"fs\" — 3 tool(s)", toolCount: 3 }, capture) as any,
      cwd: "/proj",
      persist: (name, _config, cwd) => {
        persisted = { name, cwd }
      },
    })
    const r = await tool.call(
      { name: "fs", type: "stdio", command: "npx", args: ["-y", "srv"] } as never,
      ctxArg,
    )
    expect(r.isError).toBeFalsy()
    expect(capture.name).toBe("fs")
    expect(capture.config.type).toBe("stdio")
    expect(persisted.name).toBe("fs") // persisted on success
    expect(persisted.cwd).toBe("/proj")
    expect(String(r.output)).toMatch(/Added/)
  })

  test("does NOT persist when addServer fails", async () => {
    let persistCalled = false
    const tool = createAddMcpServerTool({
      manager: fakeManager({ ok: false, message: "already exists" }) as any,
      cwd: ".",
      persist: () => {
        persistCalled = true
      },
    })
    const r = await tool.call({ name: "dup", type: "stdio", command: "x" } as never, ctxArg)
    expect(r.isError).toBe(true)
    expect(persistCalled).toBe(false)
  })

  test("a persist failure is non-fatal: server stays added, output warns", async () => {
    const tool = createAddMcpServerTool({
      manager: fakeManager({ ok: true, message: "Added \"fs\"", toolCount: 1 }) as any,
      cwd: ".",
      persist: () => {
        throw new Error("disk full")
      },
    })
    const r = await tool.call({ name: "fs", type: "stdio", command: "x" } as never, ctxArg)
    expect(r.isError).toBeFalsy()
    expect(String(r.output)).toMatch(/not saved|could not|persist/i)
  })
})
