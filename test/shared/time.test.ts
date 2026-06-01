import { describe, expect, test } from "bun:test"
import { formatRelativeTime } from "@shared/time"

const NOW = 1_700_000_000_000 // fixed reference

describe("formatRelativeTime", () => {
  test("just now (<45s)", () => expect(formatRelativeTime(NOW - 5_000, NOW)).toBe("just now"))
  test("minutes", () => expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5m ago"))
  test("hours", () => expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3h ago"))
  test("yesterday (exactly 1 day)", () => expect(formatRelativeTime(NOW - 24 * 3_600_000, NOW)).toBe("yesterday"))
  test("days", () => expect(formatRelativeTime(NOW - 4 * 24 * 3_600_000, NOW)).toBe("4d ago"))
  test("old → short date", () => {
    const ts = new Date(2026, 5, 3).getTime() // 3 Jun 2026 (month is 0-based)
    expect(formatRelativeTime(ts, ts + 40 * 24 * 3_600_000)).toBe("3 Jun")
  })
  test("future or clock skew clamps to just now", () => expect(formatRelativeTime(NOW + 10_000, NOW)).toBe("just now"))
})
