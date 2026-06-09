import { describe, expect, test } from "bun:test"
import { CalculatorTool } from "@core/tools/builtin/CalculatorTool"

const ctx = { abort: new AbortController().signal, cwd: "/" }
// The tool returns its result as a fixed-precision string in `output`; parse it back.
const num = (output: unknown) => Number(output as string)

describe("CalculatorTool", () => {
  test("is read-only", () => {
    expect(CalculatorTool.isReadOnly({ operation: "cagr", begin: 1, end: 2, years: 1 })).toBe(true)
  })

  test("cagr: compound annual growth rate", async () => {
    const r = await CalculatorTool.call({ operation: "cagr", begin: 100, end: 200, years: 2 }, ctx)
    expect(r.isError).toBeFalsy()
    expect(num(r.output)).toBeCloseTo(Math.SQRT2 - 1, 5) // (200/100)^(1/2) - 1 ≈ 0.414214
    expect(r.title).toContain("cagr")
  })

  test("simple_return and percent_change", async () => {
    const up = await CalculatorTool.call({ operation: "simple_return", begin: 100, end: 150 }, ctx)
    expect(num(up.output)).toBeCloseTo(0.5, 6)
    const down = await CalculatorTool.call({ operation: "percent_change", begin: 200, end: 100 }, ctx)
    expect(num(down.output)).toBeCloseTo(-0.5, 6)
  })

  test("sharpe_ratio", async () => {
    const r = await CalculatorTool.call(
      { operation: "sharpe_ratio", portfolio_return: 0.12, risk_free_rate: 0.02, std_dev: 0.1 },
      ctx,
    )
    expect(r.isError).toBeFalsy()
    expect(num(r.output)).toBeCloseTo(1.0, 6) // (0.12 - 0.02) / 0.10
  })

  test("annualized_vol (trading_days defaults to 252)", async () => {
    const r = await CalculatorTool.call({ operation: "annualized_vol", daily_std_dev: 0.01 }, ctx)
    expect(num(r.output)).toBeCloseTo(0.01 * Math.sqrt(252), 6)
    const explicit = await CalculatorTool.call({ operation: "annualized_vol", daily_std_dev: 0.01, trading_days: 100 }, ctx)
    expect(num(explicit.output)).toBeCloseTo(0.1, 6) // 0.01 * sqrt(100)
  })

  test("missing or invalid inputs return an error instead of crashing", async () => {
    const missingBegin = await CalculatorTool.call({ operation: "cagr", end: 200, years: 2 }, ctx)
    expect(missingBegin.isError).toBe(true)
    const missingStd = await CalculatorTool.call({ operation: "sharpe_ratio", portfolio_return: 0.1, risk_free_rate: 0.02 }, ctx)
    expect(missingStd.isError).toBe(true)
    const divByZero = await CalculatorTool.call(
      { operation: "sharpe_ratio", portfolio_return: 0.1, risk_free_rate: 0.02, std_dev: 0 },
      ctx,
    )
    expect(divByZero.isError).toBe(true)
  })
})
