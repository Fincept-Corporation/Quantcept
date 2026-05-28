import { describe, expect, test } from "bun:test"
import { z } from "zod/v4"
import { buildTool } from "@core/tools/Tool"
import { ToolRegistry } from "@core/tools/registry"
import { runAgentTurn } from "@core/agent/loop"
import type { Provider, ChatRequest, ChatResult } from "@core/llm/types"

// Fake provider: first call requests a tool, second call returns final text.
function fakeProvider(): Provider {
  let calls = 0
  return {
    id: "fake",
    async chat(_req: ChatRequest): Promise<ChatResult> {
      calls++
      if (calls === 1) return { text: "TOOL_CALL:calc:{\"operation\":\"percent_change\",\"begin\":100,\"end\":110}", inputTokens: 1, outputTokens: 1, stopReason: "tool_use" }
      return { text: "The change is 10%.", inputTokens: 1, outputTokens: 1, stopReason: "end_turn" }
    },
  }
}

describe("runAgentTurn", () => {
  test("executes a tool then returns final text, emitting events", async () => {
    const reg = new ToolRegistry()
    reg.register(buildTool({
      name: "calc", description: "", inputSchema: z.object({ operation: z.string(), begin: z.number(), end: z.number() }),
      isReadOnly: () => true,
      async call(i) { return { output: (i.end - i.begin) / i.begin } },
    }))
    const events: string[] = []
    const result = await runAgentTurn({
      provider: fakeProvider(),
      registry: reg,
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
})
