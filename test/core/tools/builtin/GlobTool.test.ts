import { describe, expect, test, beforeAll } from "bun:test"
import { tmpdir } from "os"
import path from "path"
import { mkdtempSync } from "fs"
import { GlobTool } from "@core/tools/builtin/GlobTool"

const ctxOf = (cwd: string) => ({ abort: new AbortController().signal, cwd })

describe("GlobTool", () => {
  let cwd: string
  beforeAll(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), "qc-glob-"))
    await Bun.write(path.join(cwd, "src/a.ts"), "")
    await Bun.write(path.join(cwd, "src/b.ts"), "")
    await Bun.write(path.join(cwd, "readme.md"), "")
  })
  test("is read-only", () => {
    expect(GlobTool.isReadOnly({ pattern: "**/*" })).toBe(true)
  })
  test("matches a pattern, sorted", async () => {
    const r = await GlobTool.call({ pattern: "**/*.ts" }, ctxOf(cwd))
    const out = r.output as string[]
    expect(out).toEqual(["src/a.ts", "src/b.ts"])
  })
  test("empty result is an empty array", async () => {
    const r = await GlobTool.call({ pattern: "**/*.py" }, ctxOf(cwd))
    expect(r.output).toEqual([])
  })
  test("on error, the message is in output (not an empty array)", async () => {
    // resolveInCwd throws on traversal escape → exercises the catch branch
    const r = await GlobTool.call({ pattern: "**/*", cwd: "../escape" }, ctxOf(cwd))
    expect(r.isError).toBe(true)
    expect(typeof r.output).toBe("string")
    expect(String(r.output)).toContain("glob failed")
  })
})
