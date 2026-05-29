import { describe, expect, test } from "bun:test"
import { loadSkillFromDir } from "@core/skills/load"
import path from "path"

describe("skill loader", () => {
  test("loads the bundled market-brief skill", async () => {
    const dir = path.join(import.meta.dir, "../../../src/extensions/skills/bundled/market-brief")
    const skill = await loadSkillFromDir(dir)
    expect(skill.name).toBe("market-brief")
    expect(skill.description.length).toBeGreaterThan(0)
    expect(skill.prompt).toContain("market")
  })

  test("parses a SKILL.md with CRLF line endings", async () => {
    const fs = await import("fs/promises")
    const os = await import("os")
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qc-skill-crlf-"))
    await fs.writeFile(path.join(dir, "SKILL.md"), "---\r\nname: crlf\r\ndescription: works on windows\r\n---\r\nBody line\r\n", "utf8")
    const skill = await loadSkillFromDir(dir)
    expect(skill.name).toBe("crlf")
    expect(skill.description).toBe("works on windows")
    expect(skill.prompt).toBe("Body line")
    await fs.rm(dir, { recursive: true, force: true })
  })

  test("parses a multi-line folded description (value on following indented lines)", async () => {
    const fs = await import("fs/promises")
    const os = await import("os")
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qc-skill-ml-"))
    await fs.writeFile(
      path.join(dir, "SKILL.md"),
      "---\nname: comp\ndescription:\n  Line one of the description\n  and line two continues here.\nlicense: MIT\n---\nBody",
      "utf8",
    )
    const skill = await loadSkillFromDir(dir)
    expect(skill.name).toBe("comp")
    expect(skill.description).toBe("Line one of the description and line two continues here.")
    expect(skill.prompt).toBe("Body")
    await fs.rm(dir, { recursive: true, force: true })
  })

  test("ignores nested mapping children (metadata block) without leaking keys", async () => {
    const fs = await import("fs/promises")
    const os = await import("os")
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qc-skill-meta-"))
    await fs.writeFile(
      path.join(dir, "SKILL.md"),
      "---\nname: withmeta\ndescription: A real description\nmetadata:\n  author: someone\n  version: '1.0.0'\n---\nBody",
      "utf8",
    )
    const skill = await loadSkillFromDir(dir)
    expect(skill.name).toBe("withmeta")
    expect(skill.description).toBe("A real description")
    await fs.rm(dir, { recursive: true, force: true })
  })
})
