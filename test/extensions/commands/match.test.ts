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
  test("filters out non-matching commands", () => {
    const cmds = [cmd("a", "alpha"), cmd("b", "beta")]
    expect(rankCommands("zzz", cmds)).toHaveLength(0)
  })
})
