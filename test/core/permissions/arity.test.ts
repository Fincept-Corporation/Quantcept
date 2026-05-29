import { describe, expect, test } from "bun:test"
import { arityPrefix } from "@core/permissions/arity"

describe("arityPrefix", () => {
  test("git keeps 2 tokens (subcommand)", () => {
    expect(arityPrefix(["git", "status", "--porcelain"])).toEqual(["git", "status"])
  })
  test("git config keeps 3 (longest-match)", () => {
    expect(arityPrefix(["git", "config", "user.name", "x"])).toEqual(["git", "config", "user.name"])
  })
  test("npm run keeps 3", () => {
    expect(arityPrefix(["npm", "run", "dev", "--watch"])).toEqual(["npm", "run", "dev"])
  })
  test("unknown command keeps first token only", () => {
    expect(arityPrefix(["foobar", "-x"])).toEqual(["foobar"])
  })
  test("rm keeps 1", () => {
    expect(arityPrefix(["rm", "-rf", "x"])).toEqual(["rm"])
  })
  test("empty input", () => {
    expect(arityPrefix([])).toEqual([])
  })
})
