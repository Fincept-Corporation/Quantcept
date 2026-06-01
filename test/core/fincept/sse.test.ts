import { describe, expect, test } from "bun:test"
import { parseSseFrames, toChatEvent } from "@core/fincept/sse"

describe("parseSseFrames", () => {
  test("parses a single complete frame", () => {
    const { frames, rest } = parseSseFrames('id: 1-0\nevent: text-delta\ndata: {"text":"hi"}\n\n')
    expect(frames).toEqual([{ id: "1-0", event: "text-delta", data: '{"text":"hi"}' }])
    expect(rest).toBe("")
  })
  test("holds an incomplete trailing frame in rest", () => {
    const { frames, rest } = parseSseFrames('event: done\ndata: {}\n\nevent: text-delta\ndata: {"text')
    expect(frames.length).toBe(1)
    expect(frames[0]!.event).toBe("done")
    expect(rest).toBe('event: text-delta\ndata: {"text')
  })
  test("ignores comment/keepalive lines", () => {
    const { frames } = parseSseFrames(": ping\n\nevent: finish\ndata: {}\n\n")
    expect(frames.map((f) => f.event)).toEqual(["finish"])
  })
  test("joins multi-line data", () => {
    const { frames } = parseSseFrames("data: a\ndata: b\n\n")
    expect(frames[0]!.data).toBe("a\nb")
  })
  test("tolerates CRLF line endings", () => {
    const { frames } = parseSseFrames('event: text-delta\r\ndata: {"text":"x"}\r\n\r\n')
    expect(frames[0]).toEqual({ event: "text-delta", data: '{"text":"x"}' })
  })
})

describe("toChatEvent", () => {
  test("text-delta", () =>
    expect(toChatEvent({ event: "text-delta", data: '{"text":"hi"}' })).toEqual({ type: "text-delta", text: "hi" }))
  test("tool-start", () =>
    expect(toChatEvent({ event: "tool-start", data: '{"toolUseId":"t1","tool":"quote","input":{"x":1}}' })).toEqual({
      type: "tool-start",
      toolUseId: "t1",
      tool: "quote",
      input: { x: 1 },
    }))
  test("tool-end", () =>
    expect(toChatEvent({ event: "tool-end", data: '{"toolUseId":"t1","tool":"quote","result":42,"isError":false}' })).toEqual(
      { type: "tool-end", toolUseId: "t1", tool: "quote", result: 42, isError: false },
    ))
  test("approval-required", () =>
    expect(toChatEvent({ event: "approval-required", data: '{"toolUseId":"t1","tool":"order","input":{}}' })).toEqual({
      type: "approval-required",
      toolUseId: "t1",
      tool: "order",
      input: {},
    }))
  test("finish carries usage", () =>
    expect(toChatEvent({ event: "finish", data: '{"stopReason":"end_turn","usage":{"inputTokens":10,"outputTokens":5}}' })).toEqual(
      { type: "finish", stopReason: "end_turn", usage: { inputTokens: 10, outputTokens: 5 } },
    ))
  test("error", () =>
    expect(toChatEvent({ event: "error", data: '{"code":"cancelled","message":"x"}' })).toEqual({
      type: "error",
      code: "cancelled",
      message: "x",
    }))
  test("done", () => expect(toChatEvent({ event: "done", data: "{}" })).toEqual({ type: "done" }))
  test("unknown event passes through with parsed data", () =>
    expect(toChatEvent({ event: "step-finish", data: '{"a":1}' })).toEqual({ type: "step-finish", data: { a: 1 } }))
  test("malformed data does not throw", () =>
    expect(toChatEvent({ event: "text-delta", data: "{not json" })).toEqual({ type: "text-delta", text: "" }))
})
