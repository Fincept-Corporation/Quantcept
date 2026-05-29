import { describe, expect, test } from "bun:test"
import { isGitAvailable, runGit } from "@core/snapshot/git"

describe("git wrapper", () => {
  test("isGitAvailable is true in this environment", () => {
    expect(isGitAvailable()).toBe(true)
  })
  test("runGit returns code/stdout for a basic command", () => {
    const r = runGit(["--version"], {})
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("git version")
  })
  test("runGit reports a nonzero code without throwing", () => {
    const r = runGit(["not-a-real-subcommand"], {})
    expect(r.code).not.toBe(0)
  })
})
