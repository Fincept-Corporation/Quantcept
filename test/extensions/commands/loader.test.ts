import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { discoverFileCommands } from "@ext/commands/loader"
import fs from "fs/promises"
import os from "os"
import path from "path"

let tmp: string
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "qc-cmd-"))
})
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

async function writeCmd(root: string, file: string, content: string) {
  const full = path.join(root, ".quantcept", "commands")
  await fs.mkdir(full, { recursive: true })
  await fs.writeFile(path.join(full, file), content, "utf8")
}

async function writeSkill(root: string, skillName: string, content: string) {
  const dir = path.join(root, ".quantcept", "skills", skillName)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "SKILL.md"), content, "utf8")
}

describe("discoverFileCommands", () => {
  test("loads a project .md command with frontmatter as a prompt command", async () => {
    await writeCmd(tmp, "brief.md", "---\ndescription: Quick brief\nargument-hint: <ticker>\n---\nBrief on $ARGUMENTS")
    const cmds = await discoverFileCommands({ userDir: path.join(tmp, "nouser", ".quantcept"), projectDir: path.join(tmp, ".quantcept") })
    const brief = cmds.find((c) => c.name === "brief")
    expect(brief).toBeDefined()
    expect(brief!.kind).toBe("prompt")
    expect(brief!.source).toBe("project")
    expect(brief!.description).toBe("Quick brief")
    expect(brief!.argumentHint).toBe("<ticker>")
  })

  test("project commands shadow user commands of the same name", async () => {
    const userRoot = await fs.mkdtemp(path.join(os.tmpdir(), "qc-user-"))
    await writeCmd(userRoot, "brief.md", "---\ndescription: user version\n---\nUSER")
    await writeCmd(tmp, "brief.md", "---\ndescription: project version\n---\nPROJECT")
    const cmds = await discoverFileCommands({ userDir: path.join(userRoot, ".quantcept"), projectDir: path.join(tmp, ".quantcept") })
    const brief = cmds.filter((c) => c.name === "brief")
    expect(brief).toHaveLength(1)
    expect(brief[0]!.description).toBe("project version")
    await fs.rm(userRoot, { recursive: true, force: true })
  })

  test("malformed (no-frontmatter) file still loads with fallback description", async () => {
    await writeCmd(tmp, "ok.md", "---\ndescription: fine\n---\nbody")
    await fs.writeFile(path.join(tmp, ".quantcept", "commands", "bad.md"), "no frontmatter at all", "utf8")
    const cmds = await discoverFileCommands({ userDir: path.join(tmp, "nouser", ".quantcept"), projectDir: path.join(tmp, ".quantcept") })
    expect(cmds.find((c) => c.name === "ok")).toBeDefined()
    expect(cmds.find((c) => c.name === "bad")).toBeDefined()
  })

  test("returns empty array when no command dirs exist", async () => {
    const cmds = await discoverFileCommands({ userDir: path.join(tmp, "a"), projectDir: path.join(tmp, "b") })
    expect(cmds).toEqual([])
  })

  test("substitutes args when getPrompt is called", async () => {
    await writeCmd(tmp, "brief.md", "---\ndescription: d\n---\nBrief on $ARGUMENTS")
    const cmds = await discoverFileCommands({ userDir: path.join(tmp, "nouser", ".quantcept"), projectDir: path.join(tmp, ".quantcept") })
    const brief = cmds.find((c) => c.name === "brief")!
    if (brief.kind !== "prompt") throw new Error("expected prompt")
    expect(await brief.getPrompt("NIFTY", {} as any)).toBe("Brief on NIFTY")
  })

  test("discovers a project skill dir as a prompt command with source 'skill'", async () => {
    await writeSkill(tmp, "market-brief", "---\nname: market-brief\ndescription: Produce a market brief\n---\nYou are producing a brief on $ARGUMENTS.")
    const cmds = await discoverFileCommands({ userDir: path.join(tmp, "nouser", ".quantcept"), projectDir: path.join(tmp, ".quantcept") })
    const skill = cmds.find((c) => c.name === "market-brief")
    expect(skill).toBeDefined()
    expect(skill!.kind).toBe("prompt")
    expect(skill!.source).toBe("skill")
    expect(skill!.description).toBe("Produce a market brief")
  })

  test("skill getPrompt substitutes args", async () => {
    await writeSkill(tmp, "market-brief", "---\nname: market-brief\ndescription: d\n---\nBrief on $ARGUMENTS")
    const cmds = await discoverFileCommands({ userDir: path.join(tmp, "nouser", ".quantcept"), projectDir: path.join(tmp, ".quantcept") })
    const skill = cmds.find((c) => c.name === "market-brief")!
    if (skill.kind !== "prompt") throw new Error("expected prompt")
    expect(await skill.getPrompt("NIFTY", {} as any)).toBe("Brief on NIFTY")
  })

  test("invalid skill manifest is skipped, does not throw", async () => {
    await writeSkill(tmp, "good", "---\nname: good\ndescription: ok\n---\nbody")
    await writeSkill(tmp, "bad", "no frontmatter here")
    const cmds = await discoverFileCommands({ userDir: path.join(tmp, "nouser", ".quantcept"), projectDir: path.join(tmp, ".quantcept") })
    expect(cmds.find((c) => c.name === "good")).toBeDefined()
    expect(cmds.find((c) => c.name === "bad")).toBeUndefined()
  })

  test("no skills dir is fine (commands still load)", async () => {
    await writeCmd(tmp, "x.md", "---\ndescription: d\n---\nbody")
    const cmds = await discoverFileCommands({ userDir: path.join(tmp, "nouser", ".quantcept"), projectDir: path.join(tmp, ".quantcept") })
    expect(cmds.find((c) => c.name === "x")).toBeDefined()
  })
})
