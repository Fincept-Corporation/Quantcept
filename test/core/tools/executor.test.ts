import { describe, expect, test } from "bun:test"
import { z } from "zod/v4"
import { buildTool, type Tool } from "@core/tools/Tool"
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
  test("a tool with inputJSONSchema skips Zod and passes raw input through", async () => {
    let received: unknown
    const mcpish: Tool = {
      name: "mcp__fs__read",
      description: "",
      inputSchema: z.object({ path: z.string() }), // would REJECT { foo: 1 }
      inputJSONSchema: { type: "object" },
      isReadOnly: () => true,
      isDestructive: () => false,
      async call(input) {
        received = input
        return { output: "ok" }
      },
    }
    const r = await executeTool(mcpish, { foo: 1 }, {
      mode: "ask",
      cwd: "/",
      abort: new AbortController().signal,
      ask: async () => "allow",
    })
    expect(r.output).toBe("ok")
    expect(received).toEqual({ foo: 1 })
  })
})

test("allow-rule on a pattern runs the tool without asking", async () => {
  let asked = false
  const t = buildTool({
    name: "shell",
    description: "",
    inputSchema: z.object({ command: z.string() }),
    isDestructive: () => true,
    permissionPatterns: (i) => [i.command],
    async call() {
      return { output: "ran" }
    },
  })
  const r = await executeTool(t, { command: "git status" }, {
    mode: "ask",
    cwd: "/",
    abort: new AbortController().signal,
    ask: async () => {
      asked = true
      return "allow"
    },
    rules: [{ permission: "shell", pattern: "git *", action: "allow" }],
  })
  expect(r.output).toBe("ran")
  expect(asked).toBe(false)
})

test("deny-rule blocks without calling the tool", async () => {
  let called = false
  const t = buildTool({
    name: "shell",
    description: "",
    inputSchema: z.object({ command: z.string() }),
    isDestructive: () => true,
    permissionPatterns: (i) => [i.command],
    async call() {
      called = true
      return { output: "ran" }
    },
  })
  const r = await executeTool(t, { command: "rm -rf /" }, {
    mode: "allow",
    cwd: "/",
    abort: new AbortController().signal,
    ask: async () => "allow",
    rules: [{ permission: "shell", pattern: "rm *", action: "deny" }],
  })
  expect(r.isError).toBe(true)
  expect(called).toBe(false)
})

test("no patterns + no rules → existing boolean behavior (regression)", async () => {
  let asked = false
  const t = buildTool({
    name: "w",
    description: "",
    inputSchema: z.object({}),
    isDestructive: () => true,
    async call() {
      return { output: "ran" }
    },
  })
  const r = await executeTool(t, {}, {
    mode: "ask",
    cwd: "/",
    abort: new AbortController().signal,
    ask: async () => {
      asked = true
      return "allow"
    },
    rules: [],
  })
  expect(asked).toBe(true)
  expect(r.output).toBe("ran")
})
