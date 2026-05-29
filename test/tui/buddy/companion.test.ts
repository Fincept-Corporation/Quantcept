import { describe, expect, test } from "bun:test"
import { bonesFromSeed } from "@tui/buddy/companion"
import { RARITIES, SPECIES, EYES, HATS, STAT_NAMES } from "@tui/buddy/types"

describe("bonesFromSeed", () => {
  test("deterministic for a seed", () => {
    expect(bonesFromSeed("abc")).toEqual(bonesFromSeed("abc"))
  })
  test("different seeds usually differ", () => {
    const a = bonesFromSeed("seed-A"); const b = bonesFromSeed("seed-B")
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
  test("bones are valid members", () => {
    const b = bonesFromSeed("valid")
    expect(RARITIES).toContain(b.rarity)
    expect(SPECIES).toContain(b.species)
    expect(EYES).toContain(b.eye)
    expect(HATS).toContain(b.hat)
    expect(typeof b.shiny).toBe("boolean")
    for (const s of STAT_NAMES) {
      expect(b.stats[s]).toBeGreaterThanOrEqual(1)
      expect(b.stats[s]).toBeLessThanOrEqual(10)
    }
  })
})
