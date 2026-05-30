import { describe, expect, test } from "bun:test"
import { z } from "zod/v4"
import { buildTool, type Tool } from "@core/tools/Tool"
import { executeTool } from "@core/tools/executor"
import { readOnlyPolicy, tradingPolicy } from "@core/tools/policy"

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

test("all-or-ask: an unmatched sibling pattern forces ask (no smuggling)", async () => {
  let asked = false
  const t = buildTool({
    name: "shell",
    description: "",
    inputSchema: z.object({ command: z.string() }),
    isDestructive: () => true,
    permissionPatterns: () => ["git status", "rm"],
    async call() {
      return { output: "ran" }
    },
  })
  const r = await executeTool(t, { command: "x" }, {
    mode: "allow",
    cwd: "/",
    abort: new AbortController().signal,
    ask: async () => {
      asked = true
      return "deny"
    },
    rules: [{ permission: "shell", pattern: "git *", action: "allow" }],
  })
  expect(asked).toBe(true)
  expect(r.isError).toBe(true)
})

// --- effectPolicy (graded reference monitor) tests ---
const policyBaseCtx = {
  mode: "allow" as const, cwd: process.cwd(), abort: new AbortController().signal,
  ask: async () => "allow" as const,
}
const policyWriter = buildTool({
  name: "writer", description: "", inputSchema: z.object({}),
  call: async () => ({ output: "wrote" }),
})

test("readOnlyPolicy denies a write tool", async () => {
  const r = await executeTool(policyWriter, {}, { ...policyBaseCtx, effectPolicy: readOnlyPolicy() })
  expect(r.isError).toBe(true)
  expect(String(r.output)).toContain("policy forbids")
})
test("readOnlyPolicy allows a read tool", async () => {
  const reader = buildTool({
    name: "reader2", description: "", inputSchema: z.object({}),
    isReadOnly: () => true, call: async () => ({ output: "ok" }),
  })
  const r = await executeTool(reader, {}, { ...policyBaseCtx, effectPolicy: readOnlyPolicy() })
  expect(r.isError).toBeFalsy()
  expect(r.output).toBe("ok")
})
test("gate + ask→deny blocks with needsHuman and does NOT call the tool", async () => {
  let called = false
  const irreversible = buildTool({
    name: "place_order", description: "", inputSchema: z.object({}), effectClass: "irreversible",
    call: async () => { called = true; return { output: "filled" } },
  })
  const r = await executeTool(irreversible, {}, {
    ...policyBaseCtx, effectPolicy: tradingPolicy(), ask: async () => "deny",
  })
  expect(r.needsHuman).toBe(true)
  expect(r.isError).toBe(true)
  expect(called).toBe(false)
})
test("gate + ask→allow runs the tool and returns its output", async () => {
  let called = false
  const irreversible = buildTool({
    name: "place_order", description: "", inputSchema: z.object({}), effectClass: "irreversible",
    call: async () => { called = true; return { output: "filled" } },
  })
  const r = await executeTool(irreversible, {}, {
    ...policyBaseCtx, effectPolicy: tradingPolicy(), ask: async () => "allow",
  })
  expect(r.isError).toBeFalsy()
  expect(r.output).toBe("filled")
  expect(called).toBe(true)
})

// --- riskGate (hard, non-approvable pre-trade limit) tests ---
test("riskGate failure HARD-blocks a write tool: isError, NOT needsHuman, call not invoked", async () => {
  let called = false
  const orderTool = buildTool({
    name: "place_order", description: "", inputSchema: z.object({}), effectClass: "irreversible",
    call: async () => { called = true; return { output: "filled" } },
  })
  const r = await executeTool(orderTool, {}, {
    ...policyBaseCtx,
    effectPolicy: tradingPolicy(),
    // gate would normally ask a human and ask→allow; the risk deny must win FIRST.
    ask: async () => "allow",
    riskGate: () => ({ ok: false, violation: "maxOrderNotional", detail: "notional 999 > cap 100" }),
  })
  expect(r.isError).toBe(true)
  expect(r.needsHuman).toBeFalsy()
  expect(String(r.output)).toContain("risk limit")
  expect(String(r.output)).toContain("notional 999 > cap 100")
  expect(called).toBe(false)
})

test("riskGate { ok:true } lets a write tool proceed", async () => {
  let called = false
  const orderTool = buildTool({
    name: "place_order", description: "", inputSchema: z.object({}),
    call: async () => { called = true; return { output: "filled" } },
  })
  const r = await executeTool(orderTool, {}, {
    ...policyBaseCtx,
    riskGate: () => ({ ok: true }),
  })
  expect(r.isError).toBeFalsy()
  expect(r.output).toBe("filled")
  expect(called).toBe(true)
})

test("riskGate only governs NON-read effects: a read tool with a failing gate is NOT blocked", async () => {
  let called = false
  const reader = buildTool({
    name: "get_quote", description: "", inputSchema: z.object({}),
    isReadOnly: () => true,
    call: async () => { called = true; return { output: "quote" } },
  })
  const r = await executeTool(reader, {}, {
    ...policyBaseCtx,
    riskGate: () => ({ ok: false, violation: "buyingPower", detail: "should be ignored for reads" }),
  })
  expect(r.isError).toBeFalsy()
  expect(r.output).toBe("quote")
  expect(called).toBe(true)
})

test("all-allow patterns run without asking", async () => {
  let asked = false
  const t = buildTool({
    name: "shell",
    description: "",
    inputSchema: z.object({ command: z.string() }),
    isDestructive: () => true,
    permissionPatterns: () => ["git status", "rm"],
    async call() {
      return { output: "ran" }
    },
  })
  const r = await executeTool(t, { command: "x" }, {
    mode: "ask",
    cwd: "/",
    abort: new AbortController().signal,
    ask: async () => {
      asked = true
      return "allow"
    },
    rules: [
      { permission: "shell", pattern: "git *", action: "allow" },
      { permission: "shell", pattern: "rm*", action: "allow" },
    ],
  })
  expect(asked).toBe(false)
  expect(r.output).toBe("ran")
})
