import { describe, expect, test } from "bun:test"
import { shellArgs } from "@core/tools/shell/args"

describe("shellArgs", () => {
  test("posix uses -c", () => {
    expect(shellArgs("posix", "ls -la")).toEqual(["-c", "ls -la"])
  })
  test("powershell uses -NoProfile -NonInteractive -Command", () => {
    expect(shellArgs("powershell", "Get-ChildItem")).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-ChildItem",
    ])
  })
  test("cmd uses /c", () => {
    expect(shellArgs("cmd", "dir")).toEqual(["/c", "dir"])
  })
})
