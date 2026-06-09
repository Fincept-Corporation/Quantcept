import { describe, expect, test } from "bun:test"
import { formatPlan, planTier } from "@tui/format/plan"

describe("formatPlan", () => {
  test("title-cases a single-word plan", () => {
    expect(formatPlan("pro")).toBe("Pro")
    expect(formatPlan("free")).toBe("Free")
  })
  test("normalizes shouty casing", () => {
    expect(formatPlan("PRO")).toBe("Pro")
  })
  test("title-cases multi-word plans (underscore/space/hyphen)", () => {
    expect(formatPlan("pro_plus")).toBe("Pro Plus")
    expect(formatPlan("free trial")).toBe("Free Trial")
    expect(formatPlan("pay-as-you-go")).toBe("Pay As You Go")
  })
  test("returns undefined for empty/missing", () => {
    expect(formatPlan(undefined)).toBeUndefined()
    expect(formatPlan(null)).toBeUndefined()
    expect(formatPlan("")).toBeUndefined()
    expect(formatPlan("   ")).toBeUndefined()
  })
})

describe("planTier", () => {
  test("free for free/trial/missing", () => {
    expect(planTier("free")).toBe("free")
    expect(planTier(undefined)).toBe("free")
    expect(planTier("free_trial")).toBe("free")
  })
  test("premium for enterprise/premium/ultra", () => {
    expect(planTier("enterprise")).toBe("premium")
    expect(planTier("premium")).toBe("premium")
    expect(planTier("ultra")).toBe("premium")
  })
  test("paid for pro and other named tiers", () => {
    expect(planTier("pro")).toBe("paid")
    expect(planTier("starter")).toBe("paid")
  })
})
