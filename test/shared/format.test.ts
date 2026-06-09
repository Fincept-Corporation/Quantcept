import { describe, expect, test } from "bun:test"
import { ellipsize } from "@shared/format"

describe("ellipsize", () => {
  test("returns the string unchanged when it fits", () => {
    expect(ellipsize("short", 10)).toBe("short")
  })
  test("collapses internal whitespace and trims", () => {
    expect(ellipsize("  a   b\n c  ", 10)).toBe("a b c")
  })
  test("caps at n chars with a trailing ellipsis", () => {
    expect(ellipsize("abcdefghij", 5)).toBe("abcd…")
  })
  test("counts the ellipsis within n (slice is n-1)", () => {
    expect(ellipsize("abcdefghij", 5).length).toBe(5)
  })
})
