import { describe, expect, test } from "bun:test"
import { z } from "zod/v4"
import { buildTool, type Tool } from "@core/tools/Tool"

describe("buildTool", () => {
  const tool = buildTool({
    name: "noop",
    description: "does nothing",
    inputSchema: z.object({ x: z.number() }),
    async call(input) {
      return { output: input.x * 2 }
    },
  })

  test("fills fail-closed defaults", () => {
    expect(tool.isReadOnly({ x: 1 })).toBe(false)
    expect(tool.isDestructive({ x: 1 })).toBe(false)
  })

  test("call returns structured output", async () => {
    const r = await tool.call({ x: 21 }, { abort: new AbortController().signal, cwd: "/" })
    expect(r.output).toBe(42)
  })
})

describe("Tool.inputJSONSchema", () => {
  test("buildTool leaves inputJSONSchema undefined", () => {
    const t = buildTool({
      name: "x",
      description: "",
      inputSchema: z.object({}),
      async call() {
        return { output: 1 }
      },
    })
    expect(t.inputJSONSchema).toBeUndefined()
  })
  test("a Tool may carry an inputJSONSchema", () => {
    const t: Tool = {
      name: "y",
      description: "",
      inputSchema: z.object({}),
      inputJSONSchema: { type: "object" },
      isReadOnly: () => true,
      isDestructive: () => false,
      async call() {
        return { output: 1 }
      },
    }
    expect(t.inputJSONSchema).toEqual({ type: "object" })
  })
})

describe("Tool.permissionPatterns", () => {
  test("buildTool leaves permissionPatterns undefined", () => {
    const t = buildTool({
      name: "x",
      description: "",
      inputSchema: z.object({}),
      async call() {
        return { output: 1 }
      },
    })
    expect(t.permissionPatterns).toBeUndefined()
  })
  test("a Tool may define permissionPatterns", () => {
    const t = buildTool({
      name: "shellish",
      description: "",
      inputSchema: z.object({ command: z.string() }),
      permissionPatterns: (input) => [input.command],
      async call() {
        return { output: 1 }
      },
    })
    expect(t.permissionPatterns?.({ command: "git status" })).toEqual(["git status"])
  })
})
