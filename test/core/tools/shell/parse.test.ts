import { describe, expect, test } from "bun:test"
import { describeCommand } from "@core/tools/shell/parse"

describe("describeCommand", () => {
  test("bash: parses sub-commands + labels", async () => {
    const parts = await describeCommand("git status && rm -rf x", "posix")
    expect(parts.map((p) => p.name)).toEqual(["git", "rm"])
    const rm = parts.find((p) => p.name === "rm")!
    expect(rm.risky).toBe(true)
    expect(rm.label).toBe("⚠ Deletes files")
  })
  test("powershell: parses PascalCase sub-commands", async () => {
    const parts = await describeCommand("Get-ChildItem; Remove-Item x", "powershell")
    expect(parts.map((p) => p.name)).toEqual(["Get-ChildItem", "Remove-Item"])
    expect(parts.find((p) => p.name === "Remove-Item")!.risky).toBe(true)
  })
  test("cmd kind (no grammar) → fallback to tokenizer", async () => {
    const parts = await describeCommand("git status && rm x", "cmd")
    expect(parts.map((p) => p.name)).toEqual(["git", "rm"])
  })
})
