import { describe, expect, test } from "bun:test"
import { z } from "zod/v4"
import { buildTool } from "@core/tools/Tool"
import { ToolRegistry } from "@core/tools/registry"
import { runAgentTurn } from "@core/agent/loop"
import type { Provider, ChatRequest, ChatResult, StreamHandlers } from "@core/llm/types"

function fakeProvider(): Provider {
  let calls = 0
  return {
    id: "fake",
    async chat(_req: ChatRequest, _h?: StreamHandlers): Promise<ChatResult> {
      calls++
      if (calls === 1)
        return {
          text: "",
          blocks: [{ type: "tool_use", id: "t1", name: "calc", input: { operation: "percent_change", begin: 100, end: 110 } }],
          inputTokens: 10,
          outputTokens: 5,
          stopReason: "tool_use",
        }
      return { text: "The change is 10%.", inputTokens: 3, outputTokens: 4, stopReason: "end_turn" }
    },
  }
}

function calcRegistry(): ToolRegistry {
  const reg = new ToolRegistry()
  reg.register(
    buildTool({
      name: "calc",
      description: "",
      inputSchema: z.object({ operation: z.string(), begin: z.number(), end: z.number() }),
      isReadOnly: () => true,
      async call(i) {
        return { output: { result: (i.end - i.begin) / i.begin } }
      },
    }),
  )
  return reg
}

describe("runAgentTurn", () => {
  test("executes a tool_use block then returns final text, emitting events", async () => {
    const events: string[] = []
    const result = await runAgentTurn({
      provider: fakeProvider(),
      registry: calcRegistry(),
      messages: [{ role: "user", content: "pct change 100 to 110" }],
      system: "sys",
      mode: "allow",
      cwd: "/",
      ask: async () => "allow",
      onEvent: (e) => events.push(e.type),
    })
    expect(result.text).toBe("The change is 10%.")
    expect(events).toContain("tool_start")
    expect(events).toContain("tool_end")
    expect(events).toContain("turn_end")
  })

  test("accumulates tokens across iterations", async () => {
    const result = await runAgentTurn({
      provider: fakeProvider(),
      registry: calcRegistry(),
      messages: [{ role: "user", content: "x" }],
      mode: "allow",
      cwd: "/",
      ask: async () => "allow",
    })
    expect(result.totalTokens).toBe(22)
  })
})
