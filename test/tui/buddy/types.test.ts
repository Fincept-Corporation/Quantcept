import { describe, expect, test } from "bun:test"
import { RARITIES, RARITY_WEIGHTS, RARITY_COLORS, SPECIES, EYES, HATS, STAT_NAMES, MOODS } from "@tui/buddy/types"

describe("buddy types", () => {
  test("13 species, all unique", () => {
    expect(SPECIES.length).toBe(13)
    expect(new Set(SPECIES).size).toBe(13)
  })
  test("every rarity has a weight and a theme color", () => {
    for (const r of RARITIES) {
      expect(RARITY_WEIGHTS[r]).toBeGreaterThan(0)
      expect(typeof RARITY_COLORS[r]).toBe("string")
    }
  })
  test("eyes, hats, stats, moods non-empty", () => {
    expect(EYES.length).toBeGreaterThan(0)
    expect(HATS).toContain("none")
    expect(STAT_NAMES.length).toBe(5)
    expect(MOODS).toEqual(["idle", "thinking", "success", "error", "pet"])
  })
  test("every RARITY_COLORS value is a key present in all bundled themes", async () => {
    // Guards against the theme proxy returning #ff00ff for an unmapped key.
    const themes = ["quantcept", "dracula", "nord", "tokyonight", "catppuccin"]
    for (const name of themes) {
      const json = (await import(`../../../src/tui/themes/${name}.json`)).default as { theme: Record<string, unknown> }
      for (const key of Object.values(RARITY_COLORS)) {
        expect(json.theme[key]).toBeDefined()
      }
    }
  })
})
