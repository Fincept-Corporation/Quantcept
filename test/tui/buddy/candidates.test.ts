import { describe, expect, test } from "bun:test"
import { bonesFromSeed } from "@tui/buddy/companion"
import { rosterCandidates } from "@tui/buddy/candidates"
import { SPECIES } from "@tui/buddy/types"

describe("rosterCandidates", () => {
  test("returns exactly one candidate per species, in SPECIES order", () => {
    const roster = rosterCandidates("salt-1")
    expect(roster).toHaveLength(SPECIES.length)
    expect(roster.map((c) => c.bones.species)).toEqual([...SPECIES])
  })

  test("every species is covered (no duplicates, no gaps)", () => {
    const species = rosterCandidates("salt-2").map((c) => c.bones.species)
    expect(new Set(species).size).toBe(SPECIES.length)
  })

  test("each candidate's seed actually reproduces its buddy", () => {
    // The persisted seed is the source of truth — bonesFromSeed(seed) must match the shown bones,
    // including the intended species. This guards the seed-search invariant.
    for (const c of rosterCandidates("salt-3")) {
      expect(bonesFromSeed(c.seed)).toEqual(c.bones)
    }
  })

  test("carries a non-empty soul name", () => {
    for (const c of rosterCandidates("salt-4")) {
      expect(typeof c.soul.name).toBe("string")
      expect(c.soul.name.length).toBeGreaterThan(0)
    }
  })

  test("deterministic for the same salt", () => {
    expect(rosterCandidates("same")).toEqual(rosterCandidates("same"))
  })

  test("a different salt re-rolls the look but keeps the roster complete", () => {
    const a = rosterCandidates("look-A")
    const b = rosterCandidates("look-B")
    expect(a.map((c) => c.bones.species)).toEqual(b.map((c) => c.bones.species))
    // At least some buddies should differ in their non-species traits between salts.
    const differ = a.some((c, i) => JSON.stringify(c.bones) !== JSON.stringify(b[i]!.bones))
    expect(differ).toBe(true)
  })
})
