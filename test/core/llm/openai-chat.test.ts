import { describe, expect, test } from "bun:test"
import { OpenAIChatAdapter } from "@core/llm/adapters/openai-chat"

describe("openai-chat adapter", () => {
  test("buildRequest targets /chat/completions with bearer auth", () => {
    const a = new OpenAIChatAdapter({ id: "openai-chat", model: "gpt", baseUrl: "https://o", apiKey: "k", maxTokens: 50, temperature: 0.3 })
    const { url, headers, body } = a.buildRequest({ messages: [{ role: "user", content: "hi" }], system: "sys" })
    expect(url).toBe("https://o/chat/completions")
    expect(headers.Authorization).toBe("Bearer k")
    expect(body.model).toBe("gpt")
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" })
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" })
  })

  test("buildRequest throws on block content (tools not supported yet)", () => {
    const a = new OpenAIChatAdapter({ id: "openai-chat", model: "m", baseUrl: "https://x", apiKey: "k", maxTokens: 100, temperature: 0.5 })
    expect(() =>
      a.buildRequest({
        messages: [{ role: "assistant", content: [{ type: "text", text: "hi" }] }],
      }),
    ).toThrow("openai-chat does not support tool content")
  })
})
