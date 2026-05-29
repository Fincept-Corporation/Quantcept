import { describe, expect, test } from "bun:test"
import { AnthropicMessagesAdapter } from "@core/llm/adapters/anthropic-messages"

describe("anthropic-messages adapter", () => {
  test("buildRequest produces /v1/messages payload with headers", () => {
    const a = new AnthropicMessagesAdapter({ id: "anthropic-messages", model: "m", baseUrl: "https://x", apiKey: "k", maxTokens: 100, temperature: 0.5 })
    const { url, headers, body } = a.buildRequest(
      { messages: [{ role: "user", content: "hi" }], system: "sys", stream: true },
    )
    expect(url).toBe("https://x/v1/messages")
    expect(headers["x-api-key"]).toBe("k")
    expect(headers["anthropic-version"]).toBe("2023-06-01")
    expect(body.model).toBe("m")
    expect(body.stream).toBe(true)
    expect(body.system).toBe("sys")
    expect(body.messages).toEqual([{ role: "user", content: "hi" }])
  })

  test("throws if apiKey missing", () => {
    expect(() => new AnthropicMessagesAdapter({ id: "anthropic-messages", model: "m", baseUrl: "https://x", maxTokens: 100, temperature: 0.5 })).toThrow()
  })

  test("buildRequest translates ContentBlock[] and tools into wire format", () => {
    const a = new AnthropicMessagesAdapter({ id: "anthropic-messages", model: "m", baseUrl: "https://x", apiKey: "k", maxTokens: 100, temperature: 0.5 })
    const { body } = a.buildRequest({
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "calc", input: { a: 1 } }] },
        { role: "user", content: [{ type: "tool_result", toolUseId: "t1", output: { r: 2 }, isError: false }] },
      ],
      tools: [{ name: "calc", description: "calc", inputSchema: { type: "object" } }],
    })
    const msgs = body.messages as any[]
    expect(msgs[0].content).toEqual([{ type: "tool_use", id: "t1", name: "calc", input: { a: 1 } }])
    expect(msgs[1].content).toEqual([{ type: "tool_result", tool_use_id: "t1", content: JSON.stringify({ r: 2 }), is_error: false }])
    expect((body.tools as any[])[0]).toEqual({ name: "calc", description: "calc", input_schema: { type: "object" } })
  })
})
