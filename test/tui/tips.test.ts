import { describe, expect, test } from "bun:test"
import { TIPS } from "@tui/tips"

describe("home tips", () => {
  test("there is a healthy set of tips", () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(20)
  })

  test("every tip is a short, single, non-empty line", () => {
    for (const tip of TIPS) {
      expect(tip.trim().length).toBeGreaterThan(0)
      expect(tip).not.toContain("\n")
      // Keep them quick to read on a narrow terminal.
      expect(tip.length).toBeLessThanOrEqual(80)
    }
  })

  test("tips are unique", () => {
    expect(new Set(TIPS).size).toBe(TIPS.length)
  })
})
