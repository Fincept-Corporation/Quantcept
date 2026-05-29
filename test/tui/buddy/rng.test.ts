import { describe, expect, test } from "bun:test"
import { hashString, makeRng, pickWeighted, pickUniform } from "@tui/buddy/rng"

describe("rng", () => {
  test("hashString is stable and order-sensitive", () => {
    expect(hashString("abc")).toBe(hashString("abc"))
    expect(hashString("abc")).not.toBe(hashString("acb"))
  })
  test("makeRng is deterministic for a seed", () => {
    const a = makeRng("seed-1"); const b = makeRng("seed-1")
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(a()).toBeGreaterThanOrEqual(0)
  })
  test("pickUniform returns a member", () => {
    const rng = makeRng("x")
    expect(["a", "b", "c"]).toContain(pickUniform(rng, ["a", "b", "c"] as const))
  })
  test("pickWeighted respects weights over a large sample", () => {
    const rng = makeRng("dist")
    const weights = { a: 90, b: 10 } as const
    let aCount = 0
    for (let i = 0; i < 5000; i++) if (pickWeighted(rng, weights) === "a") aCount++
    expect(aCount).toBeGreaterThan(4000) // ~90%
    expect(aCount).toBeLessThan(4900)
  })
})
