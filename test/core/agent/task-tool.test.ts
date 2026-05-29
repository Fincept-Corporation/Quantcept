import { describe, expect, test } from "bun:test"
import { z } from "zod/v4"
import { createTaskTool } from "@core/agent/task-tool"
import { ToolRegistry } from "@core/tools/registry"
import { buildTool } from "@core/tools/Tool"
import type { Provider, ChatRequest, ChatResult, StreamHandlers } from "@core/llm/types"
import type { LoadedAgent } from "@core/agent/agent-manifest"

const ctxOf = () => ({ abort: new AbortController().signal, cwd: "/" })

function recordingProvider(sink: { system?: string; tools?: string[] }): Provider {
  return {
    id: "rec",
    async chat(req: ChatRequest, _h?: StreamHandlers): Promise<ChatResult> {
      sink.system = req.system
      sink.tools = (req.tools ?? []).map((t) => t.name)
      return { text: "SUBAGENT DONE", inputTokens: 1, outputTokens: 1, stopReason: "end_turn" }
    },
  }
}

function baseRegistryWith(...names: string[]): ToolRegistry {
  const r = new ToolRegistry()
  for (const n of names)
    r.register(buildTool({ name: n, description: n, inputSchema: z.object({}), async call() { return { output: 1 } } }))
  return r
}

const AGENTS = new Map<string, LoadedAgent>([
  ["analyst", { name: "analyst", description: "x", systemPrompt: "You are an analyst." }],
])

describe("createTaskTool", () => {
  test("freeform prompt returns the sub-agent final text", async () => {
    const sink: { system?: string; tools?: string[] } = {}
    const task = createTaskTool({ provider: recordingProvider(sink), baseRegistry: baseRegistryWith("read"), rules: [], mode: "allow", agents: AGENTS, maxDepth: 1 })
    const r = await task.call({ prompt: "do a thing" }, ctxOf())
    expect(r.output).toBe("SUBAGENT DONE")
  })
  test("named agent adopts its system prompt", async () => {
    const sink: { system?: string; tools?: string[] } = {}
    const task = createTaskTool({ provider: recordingProvider(sink), baseRegistry: baseRegistryWith("read"), rules: [], mode: "allow", agents: AGENTS, maxDepth: 1 })
    await task.call({ prompt: "x", agent: "analyst" }, ctxOf())
    expect(sink.system).toBe("You are an analyst.")
  })
  test("unknown agent → isError, no spawn", async () => {
    const sink: { system?: string; tools?: string[] } = {}
    const task = createTaskTool({ provider: recordingProvider(sink), baseRegistry: baseRegistryWith("read"), rules: [], mode: "allow", agents: AGENTS, maxDepth: 1 })
    const r = await task.call({ prompt: "x", agent: "ghost" }, ctxOf())
    expect(r.isError).toBe(true)
    expect(sink.system).toBeUndefined()
  })
  test("allowlist filters the sub-registry", async () => {
    const sink: { system?: string; tools?: string[] } = {}
    const task = createTaskTool({ provider: recordingProvider(sink), baseRegistry: baseRegistryWith("read", "write", "grep"), rules: [], mode: "allow", agents: AGENTS, maxDepth: 0 })
    await task.call({ prompt: "x", tools: ["read", "grep"] }, ctxOf())
    expect(sink.tools?.sort()).toEqual(["grep", "read"])
  })
  test("maxDepth 1 → sub-registry includes a task; depth 0 → it does not", async () => {
    const sink1: { system?: string; tools?: string[] } = {}
    const t1 = createTaskTool({ provider: recordingProvider(sink1), baseRegistry: baseRegistryWith("read"), rules: [], mode: "allow", agents: AGENTS, maxDepth: 1 })
    await t1.call({ prompt: "x" }, ctxOf())
    expect(sink1.tools).toContain("task")

    const sink0: { system?: string; tools?: string[] } = {}
    const t0 = createTaskTool({ provider: recordingProvider(sink0), baseRegistry: baseRegistryWith("read"), rules: [], mode: "allow", agents: AGENTS, maxDepth: 0 })
    await t0.call({ prompt: "x" }, ctxOf())
    expect(sink0.tools).not.toContain("task")
  })
})
