import { describe, expect, test, beforeAll } from "bun:test"
import { tmpdir } from "os"
import path from "path"
import { mkdtempSync } from "fs"
import { GrepTool } from "@core/tools/builtin/GrepTool"

const ctxOf = (cwd: string) => ({ abort: new AbortController().signal, cwd })

describe("GrepTool", () => {
  let cwd: string
  beforeAll(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), "qc-grep-"))
    await Bun.write(path.join(cwd, "a.ts"), "import foo\nconst x = 1\n")
    await Bun.write(path.join(cwd, "b.ts"), "import BAR\n")
  })
  test("is read-only", () => {
    expect(GrepTool.isReadOnly({ pattern: "x" })).toBe(true)
  })
  test("finds matches as file:line:text", async () => {
    const r = await GrepTool.call({ pattern: "^import" }, ctxOf(cwd))
    const out = String(r.output)
    expect(out).toContain("a.ts:1:import foo")
    expect(out).toContain("b.ts:1:import BAR")
  })
  test("caseInsensitive matches mixed case", async () => {
    const r = await GrepTool.call({ pattern: "bar", caseInsensitive: true }, ctxOf(cwd))
    expect(String(r.output)).toContain("b.ts:1:import BAR")
  })
  test("no match returns a message, not error", async () => {
    const r = await GrepTool.call({ pattern: "zzzznope" }, ctxOf(cwd))
    expect(r.isError).toBeFalsy()
    expect(String(r.output)).toContain("no matches")
  })
  test("invalid regex returns isError", async () => {
    const r = await GrepTool.call({ pattern: "(" }, ctxOf(cwd))
    expect(r.isError).toBe(true)
  })
})
