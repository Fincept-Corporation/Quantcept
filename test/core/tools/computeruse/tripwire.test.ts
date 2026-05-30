import { describe, expect, test } from "bun:test"
import { DEFAULT_MONEY_PATTERNS, shouldTripwire } from "@core/tools/computeruse/tripwire"

const on = { enabled: true, patterns: DEFAULT_MONEY_PATTERNS }

describe("money-action tripwire", () => {
  test("trips on a money-moving window title", () => {
    expect(shouldTripwire(on, { windowTitle: "Place Order — MyBroker" })).toBe(true)
  })

  test("trips on a money-moving button label near the click", () => {
    expect(shouldTripwire(on, { buttonText: "Confirm Wire Transfer" })).toBe(true)
  })

  test("is case-insensitive", () => {
    expect(shouldTripwire(on, { buttonText: "submit order" })).toBe(true)
  })

  test("does not trip on benign UI", () => {
    expect(shouldTripwire(on, { windowTitle: "Portfolio Overview", buttonText: "Refresh" })).toBe(false)
  })

  test("never trips when disabled (override)", () => {
    expect(shouldTripwire({ enabled: false, patterns: DEFAULT_MONEY_PATTERNS }, { buttonText: "Place Order" })).toBe(false)
  })

  test("never trips with no context to inspect", () => {
    expect(shouldTripwire(on, {})).toBe(false)
  })

  test("respects custom patterns", () => {
    expect(shouldTripwire({ enabled: true, patterns: ["liquidate"] }, { buttonText: "Liquidate All" })).toBe(true)
    expect(shouldTripwire({ enabled: true, patterns: ["liquidate"] }, { buttonText: "Place Order" })).toBe(false)
  })

  test("default patterns cover the common irreversible actions", () => {
    for (const label of ["Place Order", "Submit", "Confirm", "Buy 100", "Sell All", "Transfer", "Withdraw", "Pay now"]) {
      expect(shouldTripwire(on, { buttonText: label })).toBe(true)
    }
  })
})
