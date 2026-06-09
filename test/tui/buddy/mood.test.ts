import { MOOD_COLOR, MOOD_EYE, MOOD_TOPPER, driftMood, moodWeights } from "@tui/buddy/mood"
import type { CompanionBones, StatName } from "@tui/buddy/types"
import { MOODS } from "@tui/buddy/types"
import { describe, expect, test } from "bun:test"

const stats = (over: Partial<Record<StatName, number>> = {}): Record<StatName, number> => ({
  ALPHA: 5,
  PATIENCE: 5,
  CHAOS: 5,
  WISDOM: 5,
  SNARK: 5,
  ...over,
})

const bones = (over: Partial<CompanionBones> = {}): CompanionBones => ({
  rarity: "common",
  species: "dragon",
  eye: "·",
  hat: "none",
  shiny: false,
  stats: stats(),
  ...over,
})

describe("moodWeights", () => {
  test("every mood gets a positive weight (all reachable)", () => {
    const w = moodWeights(stats())
    for (const m of MOODS) expect(w[m]).toBeGreaterThan(0)
  })

  test("high CHAOS lifts playful/excited above content", () => {
    const w = moodWeights(stats({ CHAOS: 10, PATIENCE: 1 }))
    expect(w.playful).toBeGreaterThan(w.content)
    expect(w.excited).toBeGreaterThan(w.content)
  })

  test("high PATIENCE makes content dominate; low PATIENCE lifts grumpy", () => {
    const calm = moodWeights(stats({ PATIENCE: 10 }))
    expect(calm.content).toBeGreaterThan(calm.grumpy)
    const testy = moodWeights(stats({ PATIENCE: 1 }))
    expect(testy.grumpy).toBeGreaterThan(calm.grumpy)
  })

  test("high SNARK lifts smug", () => {
    expect(moodWeights(stats({ SNARK: 10 })).smug).toBeGreaterThan(moodWeights(stats({ SNARK: 1 })).smug)
  })
})

describe("driftMood", () => {
  test("only ever returns a valid mood", () => {
    const b = bones()
    for (let i = 0; i < 50; i++) {
      expect(MOODS).toContain(driftMood(b, i * 60_000))
    }
  })

  test("deterministic within a time bucket, may change across buckets", () => {
    const b = bones()
    const t = 10_000_000
    expect(driftMood(b, t)).toBe(driftMood(b, t + 1000)) // same ~4min bucket
    // Across many buckets at least one differs (drift actually happens).
    const seen = new Set<string>()
    for (let k = 0; k < 40; k++) seen.add(driftMood(b, k * 240_000))
    expect(seen.size).toBeGreaterThan(1)
  })

  test("two buddies with different stats can land on different moods at the same time", () => {
    const calm = bones({ stats: stats({ PATIENCE: 10, CHAOS: 1 }), eye: "·" })
    const wild = bones({ stats: stats({ CHAOS: 10, PATIENCE: 1 }), eye: "✦" })
    const calmSeq = Array.from({ length: 30 }, (_, k) => driftMood(calm, k * 240_000))
    const wildSeq = Array.from({ length: 30 }, (_, k) => driftMood(wild, k * 240_000))
    expect(calmSeq.join()).not.toBe(wildSeq.join())
  })
})

describe("face maps cover every mood", () => {
  test("MOOD_COLOR / MOOD_EYE / MOOD_TOPPER define an entry for each mood", () => {
    for (const m of MOODS) {
      expect(typeof MOOD_COLOR[m]).toBe("string")
      expect(typeof MOOD_EYE[m]).toBe("string")
      expect(m in MOOD_TOPPER).toBe(true) // topper may be undefined, but the key must exist
    }
  })
})
