import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { appendJsonl, readJsonl } from "@core/storage/jsonl"

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-jsonl-"))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe("jsonl", () => {
  test("append then read round-trips records in order", () => {
    const f = join(tmp, "nested", "a.jsonl") // also exercises lazy mkdir
    appendJsonl(f, { n: 1 })
    appendJsonl(f, { n: 2 })
    expect(readJsonl<{ n: number }>(f)).toEqual([{ n: 1 }, { n: 2 }])
  })
  test("readJsonl returns [] for a missing file", () => {
    expect(readJsonl(join(tmp, "nope.jsonl"))).toEqual([])
  })
  test("readJsonl skips malformed/blank lines", () => {
    const f = join(tmp, "b.jsonl")
    writeFileSync(f, '{"n":1}\n\nnot json\n{"n":2}\n')
    expect(readJsonl<{ n: number }>(f)).toEqual([{ n: 1 }, { n: 2 }])
  })
})
