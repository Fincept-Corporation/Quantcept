import { describe, expect, test } from "bun:test"
import { autoApproveLabel, isAutoApproveToggle } from "@tui/routes/auto-approve"

describe("isAutoApproveToggle", () => {
  test("true only for shift+tab", () => {
    expect(isAutoApproveToggle({ name: "tab", shift: true })).toBe(true)
  })
  test("false for plain tab (that's the slash-popover key)", () => {
    expect(isAutoApproveToggle({ name: "tab", shift: false })).toBe(false)
    expect(isAutoApproveToggle({ name: "tab" })).toBe(false)
  })
  test("false for other shifted keys", () => {
    expect(isAutoApproveToggle({ name: "return", shift: true })).toBe(false)
  })
})

describe("autoApproveLabel", () => {
  test("reflects state", () => {
    expect(autoApproveLabel(true)).toMatch(/ON/)
    expect(autoApproveLabel(false)).toMatch(/shift\+tab/)
  })
})
