import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { discoverSkills } from "@core/skills/discover"

let root: string
function writeSkill(base: string, name: string, desc: string, body = "do the thing") {
  const dir = join(base, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${desc}\n---\n${body}\n`)
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "qc-skills-"))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("discoverSkills", () => {
  test("loads skills from all three dirs", async () => {
    const bundledDir = join(root, "bundled"); const userDir = join(root, "user"); const projectDir = join(root, "project")
    writeSkill(bundledDir, "alpha", "bundled alpha")
    writeSkill(userDir, "beta", "user beta")
    writeSkill(projectDir, "gamma", "project gamma")
    const skills = await discoverSkills({ bundledDir, userDir, projectDir })
    expect(skills.map((s) => s.name).sort()).toEqual(["alpha", "beta", "gamma"])
  })
  test("project shadows user shadows bundled on name clash", async () => {
    const bundledDir = join(root, "bundled"); const userDir = join(root, "user"); const projectDir = join(root, "project")
    writeSkill(bundledDir, "brief", "bundled version")
    writeSkill(userDir, "brief", "user version")
    writeSkill(projectDir, "brief", "project version")
    const skills = await discoverSkills({ bundledDir, userDir, projectDir })
    const brief = skills.filter((s) => s.name === "brief")
    expect(brief.length).toBe(1)
    expect(brief[0]!.description).toBe("project version")
  })
  test("skips an invalid SKILL.md but loads the rest", async () => {
    const userDir = join(root, "user")
    writeSkill(userDir, "good", "ok")
    const badDir = join(userDir, "bad"); mkdirSync(badDir, { recursive: true })
    writeFileSync(join(badDir, "SKILL.md"), "no frontmatter here")
    const skills = await discoverSkills({ bundledDir: join(root, "nope"), userDir, projectDir: join(root, "nope2") })
    expect(skills.map((s) => s.name)).toEqual(["good"])
  })
  test("missing dirs yield an empty list", async () => {
    const skills = await discoverSkills({ bundledDir: join(root, "a"), userDir: join(root, "b"), projectDir: join(root, "c") })
    expect(skills).toEqual([])
  })
})
