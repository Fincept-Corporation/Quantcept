import { describe, expect, test } from "bun:test"
import { z } from "zod/v4"
import { buildTool } from "@core/tools/Tool"
import { ToolRegistry } from "@core/tools/registry"

const t = buildTool({ name: "a", description: "d", inputSchema: z.object({}), async call() { return { output: 1 } } })

describe("ToolRegistry", () => {
  test("register + get + list", () => {
    const r = new ToolRegistry()
    r.register(t)
    expect(r.get("a")).toBe(t)
    expect(r.list().map((x) => x.name)).toEqual(["a"])
  })
  test("duplicate name throws", () => {
    const r = new ToolRegistry()
    r.register(t)
    expect(() => r.register(t)).toThrow()
  })
})
