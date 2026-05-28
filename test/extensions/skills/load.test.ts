import { describe, expect, test } from "bun:test"
import { loadSkillFromDir } from "@ext/skills/load"
import path from "path"

describe("skill loader", () => {
  test("loads the bundled market-brief skill", async () => {
    const dir = path.join(import.meta.dir, "../../../src/extensions/skills/bundled/market-brief")
    const skill = await loadSkillFromDir(dir)
    expect(skill.name).toBe("market-brief")
    expect(skill.description.length).toBeGreaterThan(0)
    expect(skill.prompt).toContain("market")
  })
})
