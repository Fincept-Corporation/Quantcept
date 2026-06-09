import { describe, expect, test } from "bun:test"
import { fuzzyMatch, rankCommands } from "@ext/commands/match"
import type { Command } from "@ext/commands/types"

const cmd = (id: string, name: string, description = "", category = ""): Command => ({
  id, name, description, category, source: "builtin", kind: "action",
  run() {},
})

describe("fuzzyMatch", () => {
  test("returns null when query chars are not a subsequence", () => {
    expect(fuzzyMatch("xyz", "clear")).toBeNull()
  })
  test("matches a contiguous prefix with a high score", () => {
    const prefix = fuzzyMatch("cl", "clear")
    const scattered = fuzzyMatch("cr", "clear")
    expect(prefix).not.toBeNull()
    expect(scattered).not.toBeNull()
    expect(prefix!.score).toBeGreaterThan(scattered!.score)
  })
  test("is case-insensitive", () => {
    expect(fuzzyMatch("CL", "clear")).not.toBeNull()
  })
  test("empty query matches with score 0", () => {
    expect(fuzzyMatch("", "clear")).toEqual({ score: 0 })
  })
  test("word-boundary matches outscore mid-word matches", () => {
    const boundary = fuzzyMatch("br", "market-brief") // 'b' starts a word
    const midword = fuzzyMatch("br", "embargo") // 'b','r' mid-word, with a gap
    expect(boundary).not.toBeNull()
    expect(midword).not.toBeNull()
    expect(boundary!.score).toBeGreaterThan(midword!.score)
  })
  test("camelCase boundaries are rewarded", () => {
    const cc = fuzzyMatch("gp", "getPrompt") // g(start) P(camel boundary)
    expect(cc).not.toBeNull()
  })
  test("consecutive run beats a gapped match of the same chars", () => {
    const consecutive = fuzzyMatch("the", "theme")
    const gapped = fuzzyMatch("the", "t-h-e-x")
    expect(consecutive!.score).toBeGreaterThan(gapped!.score)
  })
})

describe("rankCommands", () => {
  test("ranks name matches above description-only matches", () => {
    const cmds = [cmd("a", "alpha", "mentions clear here"), cmd("b", "clear")]
    const ranked = rankCommands("clear", cmds)
    expect(ranked[0]!.id).toBe("b")
  })
  test("empty query returns all commands unfiltered", () => {
    const cmds = [cmd("a", "alpha"), cmd("b", "beta")]
    expect(rankCommands("", cmds)).toHaveLength(2)
  })
  test("empty query orders by curated category, then name", () => {
    // Registration order is scrambled; the result should be grouped by the
    // curated category priority (Session before Plugins before General) and
    // sorted alphabetically by name within each category.
    const cmds = [
      cmd("help", "help", "", "General"),
      cmd("plugin", "plugin", "", "Plugins"),
      cmd("resume", "resume", "", "Session"),
      cmd("clear", "clear", "", "Session"),
    ]
    const ranked = rankCommands("", cmds).map((c) => c.name)
    expect(ranked).toEqual(["clear", "resume", "plugin", "help"])
  })
  test("empty query sorts unknown categories after curated ones", () => {
    const cmds = [cmd("z", "zed", "", "Wormhole"), cmd("p", "plugin", "", "Plugins")]
    const ranked = rankCommands("", cmds).map((c) => c.id)
    expect(ranked).toEqual(["p", "z"])
  })
  test("filters out non-matching commands", () => {
    const cmds = [cmd("a", "alpha"), cmd("b", "beta")]
    expect(rankCommands("zzz", cmds)).toHaveLength(0)
  })
})
