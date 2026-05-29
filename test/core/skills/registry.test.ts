import { describe, expect, test } from "bun:test"
import { SkillRegistry } from "@core/skills/registry"
import type { LoadedSkill } from "@core/skills/manifest"

const skills: LoadedSkill[] = [
  { name: "a", description: "A", prompt: "pa", dir: "/x/a" },
  { name: "b", description: "B", prompt: "pb", dir: "/x/b" },
]

describe("SkillRegistry", () => {
  test("all returns all skills; get finds by name", () => {
    const r = new SkillRegistry(skills)
    expect(r.all().map((s) => s.name)).toEqual(["a", "b"])
    expect(r.get("b")?.prompt).toBe("pb")
    expect(r.get("missing")).toBeUndefined()
  })
})
