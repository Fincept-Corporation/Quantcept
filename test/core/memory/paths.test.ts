import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { indexFile, memoryDir, slugify, topicFile } from "@core/memory/paths"

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-mem-paths-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("memory paths", () => {
  test("slugify normalizes title to a stable slug", () => {
    expect(slugify("Portfolio Holdings!")).toBe("portfolio-holdings")
    expect(slugify("  My  Risk Prefs  ")).toBe("my-risk-prefs")
    expect(slugify("Portfolio Holdings!")).toBe(slugify("portfolio   holdings"))
  })
  test("global scope dirs/files", () => {
    expect(memoryDir("global")).toBe(join(tmp, "data", "memory", "global"))
    expect(indexFile("global")).toBe(join(tmp, "data", "memory", "global", "MEMORY.md"))
    expect(topicFile("global", undefined, "abc")).toBe(join(tmp, "data", "memory", "global", "abc.md"))
  })
  test("project scope uses the projectHash dir", () => {
    expect(memoryDir("project", "ph123")).toBe(join(tmp, "data", "memory", "ph123"))
    expect(indexFile("project", "ph123")).toBe(join(tmp, "data", "memory", "ph123", "MEMORY.md"))
  })
})
