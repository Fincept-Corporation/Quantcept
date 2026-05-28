import { describe, expect, test } from "bun:test"
import { checkPermission } from "@core/permissions/check"

describe("checkPermission", () => {
  test("read-only tool is auto-allowed regardless of mode", () => {
    expect(checkPermission({ isReadOnly: true, isDestructive: false }, "deny")).toBe("allow")
  })
  test("destructive tool requires ask in ask mode", () => {
    expect(checkPermission({ isReadOnly: false, isDestructive: true }, "ask")).toBe("ask")
  })
  test("allow mode allows non-destructive writes", () => {
    expect(checkPermission({ isReadOnly: false, isDestructive: false }, "allow")).toBe("allow")
  })
  test("deny mode denies writes", () => {
    expect(checkPermission({ isReadOnly: false, isDestructive: false }, "deny")).toBe("deny")
  })
})
