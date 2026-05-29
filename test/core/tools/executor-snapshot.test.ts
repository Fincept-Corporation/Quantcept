import { describe, expect, test } from "bun:test"
import { executeTool } from "@core/tools/executor"
import { buildTool } from "@core/tools/Tool"
import { z } from "zod/v4"

function ctxBase() {
  return {
    mode: "allow" as const,
    cwd: process.cwd(),
    abort: new AbortController().signal,
    ask: async () => "allow" as const,
  }
}

describe("executor snapshot hook", () => {
  test("snapshots before a mutating tool and not before a read-only tool", async () => {
    const tracked: string[] = []
    const snapshot = {
      track: async (label: string) => {
        tracked.push(label)
        return "tree-hash"
      },
      revertTo: async () => {},
    }
    const writeTool = buildTool({
      name: "w", description: "", inputSchema: z.object({}),
      isReadOnly: () => false, call: async () => ({ output: "ok" }),
    })
    const readTool = buildTool({
      name: "r", description: "", inputSchema: z.object({}),
      isReadOnly: () => true, call: async () => ({ output: "ok" }),
    })
    await executeTool(writeTool, {}, { ...ctxBase(), snapshot })
    await executeTool(readTool, {}, { ...ctxBase(), snapshot })
    expect(tracked).toEqual(["w"])
  })

  test("auto-reverts when a mutating tool throws", async () => {
    const reverted: string[] = []
    const snapshot = {
      track: async () => "tree-XYZ",
      revertTo: async (h: string) => {
        reverted.push(h)
      },
    }
    const boom = buildTool({
      name: "boom", description: "", inputSchema: z.object({}),
      isReadOnly: () => false,
      call: async () => {
        throw new Error("kaboom")
      },
    })
    const res = await executeTool(boom, {}, { ...ctxBase(), snapshot })
    expect(res.isError).toBe(true)
    expect(reverted).toEqual(["tree-XYZ"])
  })
})
