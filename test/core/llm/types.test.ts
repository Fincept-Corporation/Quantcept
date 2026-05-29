import { describe, expect, test } from "bun:test"
import type { ChatMessage, ContentBlock } from "@core/llm/types"

describe("ChatMessage content", () => {
  test("accepts a plain string", () => {
    const m: ChatMessage = { role: "user", content: "hi" }
    expect(m.content).toBe("hi")
  })
  test("accepts content blocks", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "let me calc" },
      { type: "tool_use", id: "t1", name: "calc", input: { a: 1 } },
      { type: "tool_result", toolUseId: "t1", output: { result: 2 }, isError: false },
    ]
    const m: ChatMessage = { role: "assistant", content: blocks }
    expect(Array.isArray(m.content)).toBe(true)
  })
})
