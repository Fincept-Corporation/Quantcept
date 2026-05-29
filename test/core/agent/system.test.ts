import { describe, expect, test } from "bun:test"
import { SYSTEM_PROMPT } from "@core/agent/system"

describe("SYSTEM_PROMPT", () => {
  test("is a non-empty finance assistant prompt", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string")
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(50)
    expect(SYSTEM_PROMPT).toContain("Quantcept")
  })
})
