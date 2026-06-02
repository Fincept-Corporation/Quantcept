import { describe, expect, test } from "bun:test"
import { describeCommand } from "@core/tools/shell/parse"

describe("describeCommand (characterization — output must not change in the refactor)", () => {
  test("bash: splits and labels each sub-command exactly", async () => {
    const parts = await describeCommand("git push && rm -rf dist", "posix")
    expect(parts).toEqual([
      { name: "git", text: "git push", label: "Version control", risky: false },
      { name: "rm", text: "rm -rf dist", label: "⚠ Deletes files", risky: true },
    ])
  })

  test("powershell: names and risky flags are preserved", async () => {
    const parts = await describeCommand("Get-ChildItem; Remove-Item foo", "powershell")
    expect(parts.map((p) => p.name)).toEqual(["Get-ChildItem", "Remove-Item"])
    expect(parts.map((p) => p.risky)).toEqual([false, true])
  })

  test("cmd shell falls back to the tokenizer (no grammar)", async () => {
    const parts = await describeCommand("dir && del x", "cmd")
    expect(parts.length).toBeGreaterThanOrEqual(1)
    expect(parts[0].name).toBe("dir")
  })
})
