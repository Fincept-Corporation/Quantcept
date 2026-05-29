import { describe, expect, test } from "bun:test"
import { ShellTool } from "@core/tools/builtin/ShellTool"

const ctxOf = () => ({ abort: new AbortController().signal, cwd: process.cwd() })

describe("ShellTool", () => {
  test("is destructive", () => {
    expect(ShellTool.isDestructive({ command: "ls" })).toBe(true)
  })
  test("permissionPatterns tokenizes + arity-prefixes each sub-command", () => {
    expect(ShellTool.permissionPatterns?.({ command: "git status && rm -rf x" })).toEqual(["git status", "rm"])
  })
  test("runs a command and captures output + exit 0", async () => {
    const r = await ShellTool.call({ command: "echo hi" }, ctxOf())
    expect(String(r.output)).toContain("hi")
    expect(r.isError).toBeFalsy()
  })
  test("non-zero exit → isError", async () => {
    const r = await ShellTool.call({ command: "exit 3" }, ctxOf())
    expect(r.isError).toBe(true)
  })
})
