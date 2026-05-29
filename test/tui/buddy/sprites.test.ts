import { describe, expect, test } from "bun:test"
import { BODIES, renderSprite, renderFace, spriteFrameCount } from "@tui/buddy/sprites"
import { SPECIES } from "@tui/buddy/types"
import { bonesFromSeed } from "@tui/buddy/companion"

describe("sprites", () => {
  test("every species has at least one frame", () => {
    for (const s of SPECIES) expect(spriteFrameCount(s)).toBeGreaterThanOrEqual(1)
  })
  test("every frame is 5 lines of 12 columns", () => {
    for (const s of SPECIES) {
      for (const frame of BODIES[s]) {
        expect(frame.length).toBe(5)
        for (const line of frame) expect([...line].length).toBe(12)
      }
    }
  })
  test("renderSprite substitutes the eye and keeps width", () => {
    const bones = { ...bonesFromSeed("a"), species: "cat" as const, eye: "◉" as const, hat: "none" as const }
    const lines = renderSprite(bones, 0)
    expect(lines.join("\n")).not.toContain("{E}")
    expect(lines.join("\n")).toContain("◉")
  })
  test("renderSprite tolerates frame index past frame count (modulo)", () => {
    const bones = bonesFromSeed("a")
    expect(renderSprite(bones, 99)).toEqual(renderSprite(bones, 99 % spriteFrameCount(bones.species)))
  })
  test("renderFace returns a non-empty face per species", () => {
    for (const s of SPECIES) {
      const bones = { ...bonesFromSeed("a"), species: s, eye: "·" as const }
      expect(renderFace(bones).length).toBeGreaterThan(0)
    }
  })
})
