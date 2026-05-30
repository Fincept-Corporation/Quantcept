import { describe, expect, test } from "bun:test"
import { estimateCostUsd, DEFAULT_PRICES } from "@core/budget/pricing"

describe("estimateCostUsd", () => {
  test("exact arithmetic for MiniMax-M2.7 (known model)", () => {
    // 1M input @ 0.3 + 1M output @ 1.2 = $1.50
    const cost = estimateCostUsd("MiniMax-M2.7", 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(1.5, 10)
  })

  test("fractional tokens: 500k input + 200k output for MiniMax-M2.7", () => {
    // 0.5 * 0.3 + 0.2 * 1.2 = 0.15 + 0.24 = 0.39
    const cost = estimateCostUsd("MiniMax-M2.7", 500_000, 200_000)
    expect(cost).toBeCloseTo(0.39, 10)
  })

  test("unknown model returns 0", () => {
    const cost = estimateCostUsd("gpt-99-turbo", 1_000_000, 1_000_000)
    expect(cost).toBe(0)
  })

  test("undefined model returns 0", () => {
    const cost = estimateCostUsd(undefined, 1_000_000, 1_000_000)
    expect(cost).toBe(0)
  })

  test("config override wins over DEFAULT_PRICES", () => {
    // Override MiniMax with doubled prices
    const overrideTable = { "MiniMax-M2.7": { inputPerM: 0.6, outputPerM: 2.4 } }
    // 1M + 1M @ override = 0.6 + 2.4 = 3.0
    const cost = estimateCostUsd("MiniMax-M2.7", 1_000_000, 1_000_000, overrideTable)
    expect(cost).toBeCloseTo(3.0, 10)
  })

  test("config override can add a new model not in DEFAULT_PRICES", () => {
    const table = { "my-model": { inputPerM: 1.0, outputPerM: 2.0 } }
    // 2M input @ 1.0 + 500k output @ 2.0 = 2.0 + 1.0 = 3.0
    const cost = estimateCostUsd("my-model", 2_000_000, 500_000, table)
    expect(cost).toBeCloseTo(3.0, 10)
  })

  test("zero tokens yield zero cost", () => {
    expect(estimateCostUsd("MiniMax-M2.7", 0, 0)).toBe(0)
  })
})
