import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { RecallTool } from "@core/tools/builtin/RecallTool"
import { RememberTool } from "@core/tools/builtin/RememberTool"

let tmp: string
const ctx = { abort: new AbortController().signal, cwd: "/some/project" }
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-mem-tools-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("memory tools", () => {
  test("remember is non-readonly; recall is readonly", () => {
    expect(RememberTool.isReadOnly({ scope: "project", title: "x", fact: "y" })).toBe(false)
    expect(RecallTool.isReadOnly({ scope: "project", title: "x" })).toBe(true)
  })

  test("remember then recall round-trips via the tools", async () => {
    const w = await RememberTool.call({ scope: "project", title: "Portfolio", fact: "60% equities" }, ctx)
    expect(w.isError).toBeFalsy()
    const r = await RecallTool.call({ scope: "project", title: "Portfolio" }, ctx)
    expect(String(r.output)).toContain("60% equities")
  })

  test("recall of unknown topic reports not found (not an error throw)", async () => {
    const r = await RecallTool.call({ scope: "global", title: "Nothing" }, ctx)
    expect(String(r.output).toLowerCase()).toContain("no memory")
  })
})
