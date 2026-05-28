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
})
