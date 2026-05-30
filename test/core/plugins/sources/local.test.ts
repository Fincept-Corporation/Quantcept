import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { fetchLocal } from "@core/plugins/sources/local"

let srcDir: string
let destParent: string

beforeEach(async () => {
  // a fake plugin source tree: plugin.json + skills/x/SKILL.md
  srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "qc-local-src-"))
  destParent = fs.mkdtempSync(path.join(os.tmpdir(), "qc-local-dst-"))
  await fs.promises.writeFile(path.join(srcDir, "plugin.json"), '{"name":"x"}')
  await fs.promises.mkdir(path.join(srcDir, "skills", "x"), { recursive: true })
  await fs.promises.writeFile(path.join(srcDir, "skills", "x", "SKILL.md"), "# x")
})

afterEach(() => {
  fs.rmSync(srcDir, { recursive: true, force: true })
  fs.rmSync(destParent, { recursive: true, force: true })
})

describe("fetchLocal", () => {
  test("copies the source dir's contents into destDir", async () => {
    const dest = path.join(destParent, "installed")
    await fetchLocal({ path: srcDir }, dest)

    expect(fs.existsSync(path.join(dest, "plugin.json"))).toBe(true)
    expect(fs.existsSync(path.join(dest, "skills", "x", "SKILL.md"))).toBe(true)
    // contents copied, not the source dir itself nested inside
    expect(fs.readFileSync(path.join(dest, "plugin.json"), "utf8")).toBe('{"name":"x"}')
    // a real copy, not a symlink
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false)
  })

  test("resolves a relative path against process.cwd()", async () => {
    const rel = path.relative(process.cwd(), srcDir)
    const dest = path.join(destParent, "rel")
    await fetchLocal({ path: rel }, dest)
    expect(fs.existsSync(path.join(dest, "plugin.json"))).toBe(true)
  })

  test("link mode symlinks destDir at the source dir", async () => {
    const dest = path.join(destParent, "linked")
    await fetchLocal({ path: srcDir }, dest, { link: true })

    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(true)
    // reading through the link sees the source files
    expect(fs.existsSync(path.join(dest, "plugin.json"))).toBe(true)
    expect(fs.realpathSync(dest)).toBe(fs.realpathSync(srcDir))
  })

  test("throws PLUGIN when the path is not an existing directory", async () => {
    const missing = path.join(srcDir, "does-not-exist")
    const dest = path.join(destParent, "nope")
    try {
      await fetchLocal({ path: missing }, dest)
      throw new Error("expected fetchLocal to throw")
    } catch (err: any) {
      expect(err.code).toBe("PLUGIN")
    }
  })

  test("throws PLUGIN when the path is a file, not a directory", async () => {
    const file = path.join(srcDir, "plugin.json")
    const dest = path.join(destParent, "file")
    try {
      await fetchLocal({ path: file }, dest)
      throw new Error("expected fetchLocal to throw")
    } catch (err: any) {
      expect(err.code).toBe("PLUGIN")
    }
  })
})
