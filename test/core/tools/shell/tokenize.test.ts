import { describe, expect, test } from "bun:test"
import { tokenizeCommands } from "@core/tools/shell/tokenize"

describe("tokenizeCommands", () => {
  test("single command → one segment of tokens", () => {
    expect(tokenizeCommands("git status")).toEqual([["git", "status"]])
  })
  test("splits on && || ; |", () => {
    expect(tokenizeCommands("git status && rm -rf x")).toEqual([["git", "status"], ["rm", "-rf", "x"]])
    expect(tokenizeCommands("a | b ; c || d")).toEqual([["a"], ["b"], ["c"], ["d"]])
  })
  test("keeps quoted args as one token, strips quotes", () => {
    expect(tokenizeCommands('echo "a b"')).toEqual([["echo", "a b"]])
    expect(tokenizeCommands("echo 'x y'")).toEqual([["echo", "x y"]])
  })
  test("splits on newlines", () => {
    expect(tokenizeCommands("git status\nrm x")).toEqual([["git", "status"], ["rm", "x"]])
  })
  test("drops empty segments / trailing operator", () => {
    expect(tokenizeCommands("git status &&")).toEqual([["git", "status"]])
    expect(tokenizeCommands("")).toEqual([])
  })
  test("command substitution $(...) surfaces the inner command as its own segment", () => {
    const segs = tokenizeCommands("git log $(rm -rf x)")
    expect(segs.some((s) => s[0] === "rm")).toBe(true)
  })
  test("backtick substitution surfaces the inner command", () => {
    expect(tokenizeCommands("echo `rm -rf x`").some((s) => s[0] === "rm")).toBe(true)
  })
  test("single & (background) splits segments", () => {
    const segs = tokenizeCommands("git push & rm -rf x")
    expect(segs.some((s) => s[0] === "rm")).toBe(true)
  })
})
