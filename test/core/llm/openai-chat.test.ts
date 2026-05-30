import { describe, expect, test } from "bun:test"
import { OpenAIChatAdapter, assembleOpenAIStream, parseChatCompletion } from "@core/llm/adapters/openai-chat"

const cfg = {
  id: "openai-chat",
  model: "gemma4:e4b",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "ollama",
  maxTokens: 100,
  temperature: 0.5,
} as const

describe("openai-chat adapter — requests", () => {
  test("targets /chat/completions with bearer auth", () => {
    const a = new OpenAIChatAdapter(cfg)
    const { url, headers, body } = a.buildRequest({ messages: [{ role: "user", content: "hi" }], system: "sys" })
    expect(url).toBe("http://localhost:11434/v1/chat/completions")
    expect(headers.Authorization).toBe("Bearer ollama")
    expect((body.messages as unknown[])[0]).toEqual({ role: "system", content: "sys" })
    expect((body.messages as unknown[])[1]).toEqual({ role: "user", content: "hi" })
  })

  test("works without an api key (local Ollama) — no Authorization header", () => {
    const a = new OpenAIChatAdapter({ ...cfg, apiKey: undefined })
    const { headers } = a.buildRequest({ messages: [{ role: "user", content: "hi" }] })
    expect(headers.Authorization).toBeUndefined()
  })

  test("uses max_completion_tokens for GPT-5/o models, max_tokens otherwise", () => {
    const body = (model: string) =>
      new OpenAIChatAdapter({ ...cfg, model }).buildRequest({ messages: [{ role: "user", content: "hi" }] }).body
    expect(body("gpt-5.4-mini").max_completion_tokens).toBe(100)
    expect(body("gpt-5.4-mini").max_tokens).toBeUndefined()
    expect(body("o4-mini").max_completion_tokens).toBe(100)
    expect(body("gpt-4o").max_tokens).toBe(100)
    expect(body("gpt-4o").max_completion_tokens).toBeUndefined()
    expect(body("gemma4:e4b").max_tokens).toBe(100)
  })

  test("sends tool definitions in OpenAI function format", () => {
    const a = new OpenAIChatAdapter(cfg)
    const { body } = a.buildRequest({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "computer", description: "control", inputSchema: { type: "object" } }],
    })
    expect((body.tools as unknown[])[0]).toEqual({
      type: "function",
      function: { name: "computer", description: "control", parameters: { type: "object" } },
    })
  })

  test("converts an assistant tool_use block into tool_calls", () => {
    const a = new OpenAIChatAdapter(cfg)
    const { body } = a.buildRequest({
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "looking" },
            { type: "tool_use", id: "t1", name: "computer", input: { action: "screenshot" } },
          ],
        },
      ],
    })
    expect((body.messages as unknown[])[0]).toEqual({
      role: "assistant",
      content: "looking",
      tool_calls: [{ id: "t1", type: "function", function: { name: "computer", arguments: '{"action":"screenshot"}' } }],
    })
  })

  test("converts a text tool_result into a role:tool message", () => {
    const a = new OpenAIChatAdapter(cfg)
    const { body } = a.buildRequest({
      messages: [{ role: "user", content: [{ type: "tool_result", toolUseId: "t1", output: "ok", isError: false }] }],
    })
    expect((body.messages as unknown[])[0]).toEqual({ role: "tool", tool_call_id: "t1", content: "ok" })
  })

  test("converts an image-bearing tool_result into a tool message + a user image_url message", () => {
    const a = new OpenAIChatAdapter(cfg)
    const { body } = a.buildRequest({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              toolUseId: "t1",
              output: "screenshot",
              isError: false,
              image: { mediaType: "image/png", data: "B64" },
            },
          ],
        },
      ],
    })
    const msgs = body.messages as unknown[]
    expect(msgs[0]).toEqual({ role: "tool", tool_call_id: "t1", content: "screenshot" })
    expect(msgs[1]).toEqual({
      role: "user",
      content: [{ type: "image_url", image_url: { url: "data:image/png;base64,B64" } }],
    })
  })
})

describe("openai-chat adapter — response parsing", () => {
  test("parses a plain text completion", () => {
    const r = parseChatCompletion({
      choices: [{ message: { content: "hello" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    })
    expect(r.text).toBe("hello")
    expect(r.blocks).toBeUndefined()
    expect(r.stopReason).toBe("stop")
    expect(r.inputTokens).toBe(3)
    expect(r.outputTokens).toBe(4)
  })

  test("parses tool_calls into tool_use blocks and maps finish_reason to tool_use", () => {
    const r = parseChatCompletion({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "t1", type: "function", function: { name: "computer", arguments: '{"action":"left_click","coordinate":[10,20]}' } },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    })
    expect(r.stopReason).toBe("tool_use")
    expect(r.blocks).toEqual([
      { type: "tool_use", id: "t1", name: "computer", input: { action: "left_click", coordinate: [10, 20] } },
    ])
  })

  test("tolerates malformed tool-call arguments (empty input)", () => {
    const r = parseChatCompletion({
      choices: [{ message: { tool_calls: [{ id: "t1", function: { name: "computer", arguments: "{bad" } }] }, finish_reason: "tool_calls" }],
    })
    expect(r.blocks).toEqual([{ type: "tool_use", id: "t1", name: "computer", input: {} }])
  })
})

describe("openai-chat adapter — streaming", () => {
  test("accumulates text deltas and forwards chunks", () => {
    const chunks: string[] = []
    const r = assembleOpenAIStream(
      [
        { choices: [{ delta: { content: "he" } }] },
        { choices: [{ delta: { content: "llo" } }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ],
      (c) => chunks.push(c),
    )
    expect(r.text).toBe("hello")
    expect(chunks).toEqual(["he", "llo"])
    expect(r.blocks).toBeUndefined()
  })

  test("accumulates streamed tool_calls across deltas by index", () => {
    const r = assembleOpenAIStream(
      [
        { choices: [{ delta: { tool_calls: [{ index: 0, id: "t1", function: { name: "computer", arguments: "" } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"action":' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"screenshot"}' } }] } }] },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      ],
      () => {},
    )
    expect(r.stopReason).toBe("tool_use")
    expect(r.blocks).toEqual([{ type: "tool_use", id: "t1", name: "computer", input: { action: "screenshot" } }])
  })
})
