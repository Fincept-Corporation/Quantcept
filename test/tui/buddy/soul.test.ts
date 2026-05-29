import { describe, expect, test } from "bun:test"
import { fallbackSoul, generateSoul } from "@tui/buddy/soul"
import { SPECIES } from "@tui/buddy/types"
import { bonesFromSeed } from "@tui/buddy/companion"

describe("soul", () => {
  test("fallbackSoul is synchronous and non-empty for every species", () => {
    for (const s of SPECIES) {
      const soul = fallbackSoul({ ...bonesFromSeed("a"), species: s }, 1000)
      expect(soul.name.length).toBeGreaterThan(0)
      expect(soul.personality.length).toBeGreaterThan(0)
      expect(soul.hatchedAt).toBe(1000)
    }
  })
  test("generateSoul falls back when the provider throws", async () => {
    const provider = { id: "x", chat: async () => { throw new Error("no key") } }
    const bones = bonesFromSeed("a")
    const soul = await generateSoul(provider as any, bones, 1000)
    expect(soul.name.length).toBeGreaterThan(0) // fell back, did not throw
  })
  test("generateSoul uses provider text on success", async () => {
    const provider = { id: "x", chat: async () => ({ text: '{"name":"Tycho","personality":"dry"}', inputTokens: 0, outputTokens: 0, stopReason: "end" }) }
    const soul = await generateSoul(provider as any, bonesFromSeed("a"), 1000)
    expect(soul.name).toBe("Tycho")
    expect(soul.personality).toBe("dry")
  })
})
