import { describe, expect, test } from "bun:test"
import { formatElapsed } from "@tui/finance/time"

describe("formatElapsed", () => {
  test("formats seconds, minutes, hours", () => {
    expect(formatElapsed(0)).toBe("0s")
    expect(formatElapsed(45_000)).toBe("45s")
    expect(formatElapsed(90_000)).toBe("1m 30s")
    expect(formatElapsed(3_661_000)).toBe("1h 1m")
  })
  test("never negative", () => {
    expect(formatElapsed(-5000)).toBe("0s")
  })
})
