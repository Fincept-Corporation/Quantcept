import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { SnapshotEngine } from "@core/snapshot/engine"
import { isGitAvailable } from "@core/snapshot/git"

let work: string
let snap: string
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "qc-snap-work-"))
  snap = mkdtempSync(join(tmpdir(), "qc-snap-git-"))
})
afterEach(() => {
  rmSync(work, { recursive: true, force: true })
  rmSync(snap, { recursive: true, force: true })
})

const maybe = isGitAvailable() ? test : test.skip

describe("SnapshotEngine", () => {
  maybe("track returns a tree hash; restore brings a file back", () => {
    writeFileSync(join(work, "a.txt"), "original\n")
    const eng = new SnapshotEngine(work, snap)
    eng.init()
    const pre = eng.track("edit a.txt")
    expect(pre).toMatch(/^[a-f0-9]{40}$/)
    writeFileSync(join(work, "a.txt"), "MODIFIED\n")
    eng.restore(pre!)
    expect(readFileSync(join(work, "a.txt"), "utf8")).toBe("original\n")
  })

  maybe("revert restores edited files and deletes files created after the snapshot", () => {
    writeFileSync(join(work, "a.txt"), "v1\n")
    const eng = new SnapshotEngine(work, snap)
    eng.init()
    const pre = eng.track("snap")!
    writeFileSync(join(work, "a.txt"), "v2\n")
    writeFileSync(join(work, "new.txt"), "created later\n")
    eng.revert(pre, ["a.txt", "new.txt"])
    expect(readFileSync(join(work, "a.txt"), "utf8")).toBe("v1\n")
    expect(existsSync(join(work, "new.txt"))).toBe(false)
  })

  maybe("diff reports added/modified files between a tree and now", () => {
    writeFileSync(join(work, "a.txt"), "one\n")
    const eng = new SnapshotEngine(work, snap)
    eng.init()
    const pre = eng.track("snap")!
    writeFileSync(join(work, "a.txt"), "one\ntwo\n")
    writeFileSync(join(work, "b.txt"), "brand new\n")
    const diffs = eng.diff(pre)
    const byFile = Object.fromEntries(diffs.map((d) => [d.file, d]))
    expect(byFile["a.txt"]!.status).toBe("M")
    expect(byFile["b.txt"]!.status).toBe("A")
    expect(byFile["a.txt"]!.additions).toBeGreaterThan(0)
  })

  maybe("track skips a file larger than the 2MB cap", () => {
    writeFileSync(join(work, "big.bin"), "x".repeat(2 * 1024 * 1024 + 10))
    writeFileSync(join(work, "small.txt"), "ok\n")
    const eng = new SnapshotEngine(work, snap)
    eng.init()
    const pre = eng.track("snap")!
    const diffs = eng.diff(pre)
    expect(diffs.every((d) => d.file !== "big.bin" || d.status === "A")).toBe(true)
    expect(diffs.find((d) => d.file === "small.txt")).toBeUndefined()
  })
})
