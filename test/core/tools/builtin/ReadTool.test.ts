import { describe, expect, test, beforeAll } from "bun:test"
import { tmpdir } from "os"
import path from "path"
import { mkdtempSync } from "fs"
import { ReadTool } from "@core/tools/builtin/ReadTool"

const ctxOf = (cwd: string) => ({ abort: new AbortController().signal, cwd })

describe("ReadTool", () => {
  let cwd: string
  beforeAll(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), "qc-read-"))
    await Bun.write(path.join(cwd, "a.txt"), "line1\nline2\nline3\n")
  })
  test("is read-only", () => {
    expect(ReadTool.isReadOnly({ path: "a.txt" })).toBe(true)
  })
  test("reads file content with line numbers", async () => {
    const r = await ReadTool.call({ path: "a.txt" }, ctxOf(cwd))
    expect(String(r.output)).toContain("line1")
    expect(String(r.output)).toContain("line3")
  })
  test("offset + limit slices lines", async () => {
    const r = await ReadTool.call({ path: "a.txt", offset: 2, limit: 1 }, ctxOf(cwd))
    expect(String(r.output)).toContain("line2")
    expect(String(r.output)).not.toContain("line3")
  })
  test("missing file returns isError", async () => {
    const r = await ReadTool.call({ path: "nope.txt" }, ctxOf(cwd))
    expect(r.isError).toBe(true)
  })
  test("path traversal returns isError", async () => {
    const r = await ReadTool.call({ path: "../x" }, ctxOf(cwd))
    expect(r.isError).toBe(true)
  })
})
