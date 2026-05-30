import { describe, expect, test } from "bun:test"
import { parseResponsesTurn } from "@core/agent/openaiComputerUse"

describe("parseResponsesTurn", () => {
  test("extracts a computer_call with batched actions", () => {
    const t = parseResponsesTurn({
      id: "resp_1",
      output: [
        { type: "reasoning" },
        { type: "computer_call", call_id: "c1", actions: [{ type: "click", x: 1, y: 2 }], status: "completed" },
      ],
    })
    expect(t.id).toBe("resp_1")
    expect(t.computerCall).toEqual({ callId: "c1", actions: [{ type: "click", x: 1, y: 2 }] })
    expect(t.text).toBe("")
  })

  test("extracts final message text when there is no computer_call", () => {
    const t = parseResponsesTurn({
      id: "r2",
      output: [{ type: "message", content: [{ type: "output_text", text: "All done." }] }],
    })
    expect(t.computerCall).toBeUndefined()
    expect(t.text).toBe("All done.")
  })

  test("handles an empty output", () => {
    expect(parseResponsesTurn({ id: "r3", output: [] })).toEqual({ id: "r3", computerCall: undefined, text: "" })
  })
})
