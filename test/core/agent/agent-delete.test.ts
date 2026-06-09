import { describe, expect, test, beforeEach } from "bun:test"
import { mkdtempSync } from "fs"
import { mkdir, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { deleteAgentFile } from "@core/agent/agents"
import path from "path"

describe("deleteAgentFile", () => {
  let root: string
  let userDir: string
  let projectDir: string
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "qc-agent-del-"))
    userDir = path.join(root, "user", "agents")
    projectDir = path.join(root, "project", "agents")
  })

  test("deletes a user-scope agent file and reports the path", async () => {
    await mkdir(userDir, { recursive: true })
    const file = path.join(userDir, "mine.md")
    await writeFile(file, "---\nname: mine\ndescription: d\n---\n\nbody\n")
    const removed = await deleteAgentFile("mine", { userDir, projectDir })
    expect(removed).toEqual([file])
    expect(await Bun.file(file).exists()).toBe(false)
  })

  test("removes from both user and project when present in both", async () => {
    await mkdir(userDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(userDir, "dup.md"), "x")
    await writeFile(path.join(projectDir, "dup.md"), "x")
    const removed = await deleteAgentFile("dup", { userDir, projectDir })
    expect(removed.length).toBe(2)
  })

  test("returns an empty list when nothing matches (e.g. a built-in name)", async () => {
    await mkdir(userDir, { recursive: true })
    const removed = await deleteAgentFile("analyst", { userDir, projectDir })
    expect(removed).toEqual([])
  })

  test("does NOT escape the agents dir via a path-traversal name", async () => {
    await mkdir(projectDir, { recursive: true })
    // A sentinel two levels above the agents dir that a naive `${name}.md` join would reach.
    const sentinel = path.join(root, "sentinel.md")
    await writeFile(sentinel, "important")
    const removed = await deleteAgentFile("../../sentinel", { userDir, projectDir })
    expect(removed).toEqual([])
    expect(await Bun.file(sentinel).exists()).toBe(true)
  })

  test("deletes by display name, matching how create slugifies (My Trader! → my-trader.md)", async () => {
    await mkdir(userDir, { recursive: true })
    await writeFile(path.join(userDir, "my-trader.md"), "x")
    const removed = await deleteAgentFile("My Trader!", { userDir, projectDir })
    expect(removed).toEqual([path.join(userDir, "my-trader.md")])
  })
})
