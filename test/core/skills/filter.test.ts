import { describe, expect, test } from "bun:test"
import { buildTool } from "@core/tools/Tool"
import { ToolRegistry } from "@core/tools/registry"
import { filterRegistry } from "@core/skills/filter"
import { z } from "zod/v4"

function reg() {
  const r = new ToolRegistry()
  for (const n of ["read", "write", "calc"]) {
    r.register(buildTool({ name: n, description: n, inputSchema: z.object({}), call: async () => ({ output: "" }) }))
  }
  return r
}

describe("filterRegistry", () => {
  test("undefined allowed → same registry", () => {
    const r = reg()
    expect(filterRegistry(r, undefined)).toBe(r)
  })
  test("filters to the allowlist, skipping unknown names", () => {
    const filtered = filterRegistry(reg(), ["read", "nope"])
    expect(filtered.list().map((t) => t.name).sort()).toEqual(["read"])
  })
})
