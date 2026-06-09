import { describe, expect, test } from "bun:test"
import { financeTool } from "@core/tools/finance/financeTool"

describe("financeTool factory", () => {
  test("builds a read-only single-ticker tool with the given identity", () => {
    const t = financeTool("cashflow", "Fetch the annual cash flow statement for a stock ticker via yfinance.", "cashflow")
    expect(t.name).toBe("cashflow")
    expect(t.description).toContain("cash flow")
    expect(t.isReadOnly({ ticker: "AAPL" })).toBe(true)
  })

  test("input schema requires a ticker", () => {
    const t = financeTool("ticker_info", "info", "info")
    expect(t.inputSchema.safeParse({}).success).toBe(false)
    expect(t.inputSchema.safeParse({ ticker: "AAPL" }).success).toBe(true)
  })
})
