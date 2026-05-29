import { describe, expect, test, beforeAll } from "bun:test"
import { tmpdir } from "os"
import path from "path"
import { mkdtempSync } from "fs"
import { WriteTool } from "@core/tools/builtin/WriteTool"

const ctxOf = (cwd: string) => ({ abort: new AbortController().signal, cwd })

describe("WriteTool", () => {
  let cwd: string
  beforeAll(() => {
    cwd = mkdtempSync(path.join(tmpdir(), "qc-write-"))
  })
  test("is destructive", () => {
    expect(WriteTool.isDestructive({ path: "x", content: "y" })).toBe(true)
  })
  test("writes a file", async () => {
    const r = await WriteTool.call({ path: "out.txt", content: "hello" }, ctxOf(cwd))
    expect(r.isError).toBeFalsy()
    expect(await Bun.file(path.join(cwd, "out.txt")).text()).toBe("hello")
  })
  test("path traversal returns isError", async () => {
    const r = await WriteTool.call({ path: "../evil.txt", content: "x" }, ctxOf(cwd))
    expect(r.isError).toBe(true)
  })
})
