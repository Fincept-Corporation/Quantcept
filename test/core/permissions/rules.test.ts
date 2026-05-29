import { describe, expect, test } from "bun:test"
import { evaluate, type PermissionRule } from "@core/permissions/rules"

describe("evaluate", () => {
  test("returns the matched rule's action", () => {
    const rules: PermissionRule[] = [{ permission: "shell", pattern: "git *", action: "allow" }]
    expect(evaluate("shell", "git status", rules)).toBe("allow")
  })
  test("no match returns undefined (→ boolean fallback)", () => {
    const rules: PermissionRule[] = [{ permission: "shell", pattern: "git *", action: "allow" }]
    expect(evaluate("shell", "rm -rf x", rules)).toBeUndefined()
    expect(evaluate("other", "git status", rules)).toBeUndefined()
  })
  test("latest-wins when multiple rules match", () => {
    const rules: PermissionRule[] = [
      { permission: "shell", pattern: "*", action: "allow" },
      { permission: "shell", pattern: "rm *", action: "deny" },
    ]
    expect(evaluate("shell", "rm -rf x", rules)).toBe("deny")
    expect(evaluate("shell", "git status", rules)).toBe("allow")
  })
  test("permission glob matches any tool", () => {
    const rules: PermissionRule[] = [{ permission: "*", pattern: "secret *", action: "deny" }]
    expect(evaluate("anytool", "secret thing", rules)).toBe("deny")
  })
  test("empty rules → undefined", () => {
    expect(evaluate("shell", "git status", [])).toBeUndefined()
  })
})
