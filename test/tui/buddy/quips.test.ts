import { describe, expect, test } from "bun:test"
import { QUIP_POOLS, pickQuip, mergeCachedQuips, QUIP_CACHE_CAP } from "@tui/buddy/quips"
import { MOODS } from "@tui/buddy/types"

describe("quips", () => {
  test("every mood has a non-empty pool", () => {
    for (const m of MOODS) expect(QUIP_POOLS[m].length).toBeGreaterThan(0)
  })
  test("pickQuip avoids the most recent line", () => {
    const recent: string[] = []
    for (let i = 0; i < 20; i++) {
      const line = pickQuip("content", recent)
      expect(recent[recent.length - 1]).not.toBe(line)
      recent.push(line)
    }
  })
  test("mergeCachedQuips appends and respects the cap", () => {
    const cache = Array.from({ length: QUIP_CACHE_CAP + 5 }, (_, i) => ({ mood: "content" as const, line: `x${i}` }))
    const merged = mergeCachedQuips(cache)
    expect(merged.length).toBeLessThanOrEqual(QUIP_CACHE_CAP)
  })
})
