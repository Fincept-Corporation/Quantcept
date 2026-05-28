import { describe, expect, test } from "bun:test"
import { z } from "zod/v4"
import { buildTool } from "@core/tools/Tool"
import { executeTool } from "@core/tools/executor"

const echo = buildTool({
  name: "echo",
  description: "echo",
  inputSchema: z.object({ msg: z.string() }),
  isReadOnly: () => true,
  async call(input) { return { output: input.msg } },
})

describe("executeTool", () => {
  test("rejects invalid input with a model-facing error", async () => {
    const r = await executeTool(echo, { msg: 123 }, { mode: "ask", cwd: "/", abort: new AbortController().signal, ask: async () => "allow" })
    expect(r.isError).toBe(true)
    expect(String(r.output)).toContain("invalid")
  })
  test("read-only tool runs without asking", async () => {
    let asked = false
    const r = await executeTool(echo, { msg: "hi" }, { mode: "deny", cwd: "/", abort: new AbortController().signal, ask: async () => { asked = true; return "allow" } })
    expect(r.output).toBe("hi")
    expect(asked).toBe(false)
  })
  test("denied permission returns error without calling", async () => {
    const writeTool = buildTool({ name: "w", description: "", inputSchema: z.object({}), async call() { return { output: "ran" } } })
    const r = await executeTool(writeTool, {}, { mode: "deny", cwd: "/", abort: new AbortController().signal, ask: async () => "deny" })
    expect(r.isError).toBe(true)
  })
})
