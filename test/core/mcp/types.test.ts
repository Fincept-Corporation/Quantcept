import { describe, expect, test } from "bun:test"
import type { McpToolDef } from "@core/mcp/types"

describe("McpToolDef", () => {
  test("accepts a tool def with annotations", () => {
    const def: McpToolDef = {
      name: "read_file",
      description: "Read a file",
      inputSchema: { type: "object", properties: { path: { type: "string" } } },
      annotations: { readOnlyHint: true },
    }
    expect(def.name).toBe("read_file")
    expect(def.annotations?.readOnlyHint).toBe(true)
  })
})
