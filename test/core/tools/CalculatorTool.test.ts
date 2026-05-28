import { describe, expect, test } from "bun:test"
import { CalculatorTool } from "@core/tools/builtin/CalculatorTool"

describe("CalculatorTool", () => {
  test("computes compound growth (CAGR)", async () => {
    const r = await CalculatorTool.call({ operation: "cagr", begin: 100, end: 200, years: 2 }, { abort: new AbortController().signal, cwd: "/" })
    expect((r.output as { result: number }).result).toBeCloseTo(0.4142, 3)
  })
  test("is read-only", () => {
    expect(CalculatorTool.isReadOnly({ operation: "cagr", begin: 1, end: 2, years: 1 })).toBe(true)
  })
})
