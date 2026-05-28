import { describe, expect, test } from "bun:test"
import { z } from "zod/v4"
import { buildTool } from "@core/tools/Tool"

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
