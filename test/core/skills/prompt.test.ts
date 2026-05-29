import { describe, expect, test } from "bun:test"
import { skillsSystemBlock } from "@core/skills/prompt"
import type { LoadedSkill } from "@core/skills/manifest"

describe("skillsSystemBlock", () => {
  test("empty for no skills", () => {
    expect(skillsSystemBlock([])).toBe("")
  })
  test("lists name: description lines", () => {
    const block = skillsSystemBlock([
      { name: "market-brief", description: "Concise brief", prompt: "", dir: "" },
    ] as LoadedSkill[])
    expect(block).toContain("/market-brief — Concise brief")
  })
})
