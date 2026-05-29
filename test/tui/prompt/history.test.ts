import { describe, expect, test } from "bun:test"
import { historyPrev, historyNext, type HistoryState } from "@tui/components/prompt/history"

const H = ["first", "second", "third"] // oldest → newest

describe("history navigation", () => {
  test("up from live draft recalls the newest entry", () => {
    const s: HistoryState = { index: null }
    const r = historyPrev(H, s)
    expect(r.value).toBe("third")
    expect(r.state.index).toBe(2)
  })

  test("repeated up walks backward through history", () => {
    let r = historyPrev(H, { index: null })
    expect(r.value).toBe("third")
    r = historyPrev(H, r.state)
    expect(r.value).toBe("second")
    r = historyPrev(H, r.state)
    expect(r.value).toBe("first")
  })

  test("up stops at the oldest entry", () => {
    const r = historyPrev(H, { index: 0 })
    expect(r.value).toBe("first")
    expect(r.state.index).toBe(0)
  })

  test("down walks forward and returns to the live draft at the end", () => {
    let r = historyNext(H, { index: 0 })
    expect(r.value).toBe("second")
    r = historyNext(H, { index: 1 })
    expect(r.value).toBe("third")
    // Past the newest → back to live draft (null index, empty value).
    r = historyNext(H, { index: 2 })
    expect(r.state.index).toBeNull()
    expect(r.value).toBe("")
  })

  test("down while already on the live draft is a no-op", () => {
    const r = historyNext(H, { index: null })
    expect(r.state.index).toBeNull()
    expect(r.value).toBeNull() // null value = caller should do nothing
  })

  test("up on empty history does nothing", () => {
    const r = historyPrev([], { index: null })
    expect(r.state.index).toBeNull()
    expect(r.value).toBeNull()
  })
})
