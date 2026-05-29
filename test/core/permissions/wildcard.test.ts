import { describe, expect, test } from "bun:test"
import { wildcardMatch } from "@core/permissions/wildcard"

describe("wildcardMatch", () => {
  test("'*' matches anything", () => {
    expect(wildcardMatch("git status", "*")).toBe(true)
    expect(wildcardMatch("", "*")).toBe(true)
  })
  test("prefix glob matches", () => {
    expect(wildcardMatch("git status", "git *")).toBe(true)
    expect(wildcardMatch("npm install", "git *")).toBe(false)
  })
  test("exact literal matches only itself", () => {
    expect(wildcardMatch("rm", "rm")).toBe(true)
    expect(wildcardMatch("rmdir", "rm")).toBe(false)
  })
  test("regex metachars in pattern are literal", () => {
    expect(wildcardMatch("a.b", "a.b")).toBe(true)
    expect(wildcardMatch("axb", "a.b")).toBe(false)
  })
  test("'*' spans slashes", () => {
    expect(wildcardMatch("src/core/x.ts", "src/*")).toBe(true)
  })
})
