import { describe, expect, test } from "bun:test"
import { computeWindow, nextIndex } from "@tui/ui/modal/window"

describe("computeWindow", () => {
  test("returns the whole range when it fits", () => {
    expect(computeWindow(5, 0, 14)).toEqual({ offset: 0, end: 5, selected: 0 })
  })
  test("centers the cursor when overflowing", () => {
    // len 100, cursor 50, size 14 → offset 43, end 57, selected = 50-43 = 7
    expect(computeWindow(100, 50, 14)).toEqual({ offset: 43, end: 57, selected: 7 })
  })
  test("clamps the window at the start", () => {
    expect(computeWindow(100, 2, 14)).toEqual({ offset: 0, end: 14, selected: 2 })
  })
  test("clamps the window at the end", () => {
    expect(computeWindow(100, 99, 14)).toEqual({ offset: 86, end: 100, selected: 13 })
  })
})

describe("nextIndex", () => {
  test("moves down and clamps at the end", () => {
    expect(nextIndex(5, 4, 1)).toBe(4)
    expect(nextIndex(5, 3, 1)).toBe(4)
  })
  test("moves up and clamps at zero", () => {
    expect(nextIndex(5, 0, -1)).toBe(0)
    expect(nextIndex(5, 2, -1)).toBe(1)
  })
  test("handles an empty list", () => {
    expect(nextIndex(0, 0, 1)).toBe(0)
  })
})
