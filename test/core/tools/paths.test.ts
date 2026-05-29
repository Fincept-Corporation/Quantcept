import { describe, expect, test } from "bun:test"
import path from "path"
import { resolveInCwd } from "@core/tools/paths"

describe("resolveInCwd", () => {
  const cwd = path.resolve("/tmp/ws")
  test("resolves a relative path inside cwd", () => {
    expect(resolveInCwd(cwd, "a/b.txt")).toBe(path.join(cwd, "a/b.txt"))
  })
  test("allows cwd root itself", () => {
    expect(resolveInCwd(cwd, ".")).toBe(cwd)
  })
  test("rejects parent-traversal escape", () => {
    expect(() => resolveInCwd(cwd, "../secret")).toThrow("escapes workspace")
  })
  test("rejects absolute path outside cwd", () => {
    expect(() => resolveInCwd(cwd, path.resolve("/etc/passwd"))).toThrow("escapes workspace")
  })
})
