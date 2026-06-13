import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { HISTORY_CAP, loadHistory, pushHistory } from "@core/storage/history"
import { stateDir } from "@core/storage/paths"

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-hist-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("prompt history", () => {
  test("loadHistory tolerates a missing file", () => {
    expect(loadHistory()).toEqual([])
  })
  test("pushHistory persists and loadHistory returns oldest→newest text", () => {
    pushHistory("first")
    pushHistory("second")
    expect(loadHistory()).toEqual(["first", "second"])
  })
  test("pushHistory skips a consecutive duplicate", () => {
    pushHistory("a")
    pushHistory("a")
    expect(loadHistory()).toEqual(["a"])
  })
  test("pushHistory caps the file at HISTORY_CAP entries", () => {
    for (let i = 0; i < HISTORY_CAP + 10; i++) pushHistory(`p${i}`)
    const h = loadHistory()
    expect(h.length).toBe(HISTORY_CAP)
    expect(h[h.length - 1]).toBe(`p${HISTORY_CAP + 9}`) // newest kept
  })
  test("pushHistory leaves no .tmp file behind (atomic replace)", () => {
    pushHistory("first")
    pushHistory("second")
    const leftovers = readdirSync(stateDir()).filter((f) => f.endsWith(".tmp"))
    expect(leftovers).toEqual([])
  })
})
