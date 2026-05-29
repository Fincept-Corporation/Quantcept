import { describe, expect, test, beforeEach } from "bun:test"
import { tmpdir } from "os"
import path from "path"
import { mkdtempSync } from "fs"
import { EditTool } from "@core/tools/builtin/EditTool"

const ctxOf = (cwd: string) => ({ abort: new AbortController().signal, cwd })

describe("EditTool", () => {
  let cwd: string
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), "qc-edit-"))
    await Bun.write(path.join(cwd, "f.txt"), "alpha beta alpha\n")
  })
  test("is destructive", () => {
    expect(EditTool.isDestructive({ path: "f.txt", oldString: "a", newString: "b" })).toBe(true)
  })
  test("replaces a unique oldString", async () => {
    const r = await EditTool.call({ path: "f.txt", oldString: "beta", newString: "GAMMA" }, ctxOf(cwd))
    expect(r.isError).toBeFalsy()
    expect(await Bun.file(path.join(cwd, "f.txt")).text()).toBe("alpha GAMMA alpha\n")
  })
  test("not-found returns isError", async () => {
    const r = await EditTool.call({ path: "f.txt", oldString: "zzz", newString: "x" }, ctxOf(cwd))
    expect(r.isError).toBe(true)
  })
  test("non-unique without replaceAll returns isError", async () => {
    const r = await EditTool.call({ path: "f.txt", oldString: "alpha", newString: "X" }, ctxOf(cwd))
    expect(r.isError).toBe(true)
  })
  test("replaceAll replaces every occurrence", async () => {
    const r = await EditTool.call({ path: "f.txt", oldString: "alpha", newString: "X", replaceAll: true }, ctxOf(cwd))
    expect(r.isError).toBeFalsy()
    expect(await Bun.file(path.join(cwd, "f.txt")).text()).toBe("X beta X\n")
  })
})
