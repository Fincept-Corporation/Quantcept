import { describe, expect, test } from "bun:test"
import { detectShell } from "@core/tools/shell/detect"

describe("detectShell", () => {
  test("returns a non-empty path and a valid kind", () => {
    const { path, kind } = detectShell()
    expect(typeof path).toBe("string")
    expect(path.length).toBeGreaterThan(0)
    expect(["posix", "powershell", "cmd"]).toContain(kind)
  })
  test("kind matches platform family", () => {
    const { kind } = detectShell()
    if (process.platform === "win32") {
      expect(["powershell", "cmd", "posix"]).toContain(kind)
    } else {
      expect(kind).toBe("posix")
    }
  })
})
