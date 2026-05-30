import { describe, expect, test } from "bun:test"
import { messagesContainImage } from "@core/llm/vision"
import type { ChatMessage } from "@core/llm/types"

describe("messagesContainImage", () => {
  test("false for plain text messages", () => {
    expect(messagesContainImage([{ role: "user", content: "hi" }])).toBe(false)
  })

  test("false for a tool_result without an image", () => {
    const m: ChatMessage = {
      role: "user",
      content: [{ type: "tool_result", toolUseId: "t", output: "ok", isError: false }],
    }
    expect(messagesContainImage([m])).toBe(false)
  })

  test("true when a tool_result carries an image", () => {
    const m: ChatMessage = {
      role: "user",
      content: [{ type: "tool_result", toolUseId: "t", output: "shot", isError: false, image: { mediaType: "image/png", data: "X" } }],
    }
    expect(messagesContainImage([m])).toBe(true)
  })

  test("scans every message in the history", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "ok" }] },
      { role: "user", content: [{ type: "tool_result", toolUseId: "t", output: "", isError: false, image: { mediaType: "image/png", data: "Y" } }] },
    ]
    expect(messagesContainImage(msgs)).toBe(true)
  })
})
