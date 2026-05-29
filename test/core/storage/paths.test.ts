import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { configRoot, dataDir, stateDir, sessionsDir, dbFile, promptHistoryFile, ensureDir, projectHash } from "@core/storage/paths"

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-paths-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("paths", () => {
  test("honors QUANTCEPT_CONFIG_DIR for the whole tree", () => {
    expect(configRoot()).toBe(tmp)
    expect(dataDir()).toBe(join(tmp, "data"))
    expect(stateDir()).toBe(join(tmp, "state"))
    expect(dbFile()).toBe(join(tmp, "data", "quantcept.db"))
    expect(promptHistoryFile()).toBe(join(tmp, "state", "prompt-history.jsonl"))
    expect(sessionsDir("abc")).toBe(join(tmp, "data", "sessions", "abc"))
  })
  test("ensureDir creates a directory idempotently", () => {
    const d = join(tmp, "data", "sessions", "x")
    ensureDir(d)
    ensureDir(d)
    expect(existsSync(d)).toBe(true)
  })
  test("projectHash is stable per path and differs across paths", () => {
    expect(projectHash("/repo/a")).toBe(projectHash("/repo/a"))
    expect(projectHash("/repo/a")).not.toBe(projectHash("/repo/b"))
    expect(projectHash("/repo/a")).toMatch(/^[a-f0-9]{8,}$/)
  })
})
