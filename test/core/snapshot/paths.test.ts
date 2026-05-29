import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { snapshotGitDir } from "@core/snapshot/paths"

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-snap-paths-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("snapshot paths", () => {
  test("snapshotGitDir is under data/snapshot/<projectHash>", () => {
    expect(snapshotGitDir("abc123")).toBe(join(tmp, "data", "snapshot", "abc123"))
  })
})
