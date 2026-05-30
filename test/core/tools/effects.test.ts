import { describe, expect, it } from "bun:test"
import { effectClassOf } from "@core/tools/effects"
import { buildTool } from "@core/tools/Tool"
import { z } from "zod/v4"

const readTool = buildTool({
  name: "reader", description: "", inputSchema: z.object({}),
  isReadOnly: () => true,
  call: async () => ({ output: "" }),
})
const writeTool = buildTool({
  name: "writer", description: "", inputSchema: z.object({}),
  call: async () => ({ output: "" }),
})
const explicitTool = buildTool({
  name: "x", description: "", inputSchema: z.object({}), effectClass: "irreversible",
  call: async () => ({ output: "" }),
})

describe("effectClassOf", () => {
  it("derives 'read' from a read-only tool", () => { expect(effectClassOf(readTool, {})).toBe("read") })
  it("derives 'write' from a non-read-only tool", () => { expect(effectClassOf(writeTool, {})).toBe("write") })
  it("respects an explicit effectClass", () => { expect(effectClassOf(explicitTool, {})).toBe("irreversible") })
})
