import { describe, expect, test } from "bun:test"
import { TickerInfoTool } from "@core/tools/finance/TickerInfoTool"
import { IncomeStatementTool } from "@core/tools/finance/IncomeStatementTool"
import { BalanceSheetTool } from "@core/tools/finance/BalanceSheetTool"
import { CashflowTool } from "@core/tools/finance/CashflowTool"
import { PriceHistoryTool } from "@core/tools/finance/PriceHistoryTool"

const all = [TickerInfoTool, IncomeStatementTool, BalanceSheetTool, CashflowTool, PriceHistoryTool]

describe("finance tools", () => {
  test("all are read-only with distinct names", () => {
    const names = all.map((t) => t.name)
    expect(new Set(names).size).toBe(5)
    for (const t of all) expect(t.isReadOnly({ ticker: "AAPL" })).toBe(true)
  })
  test("names match the contract", () => {
    expect(TickerInfoTool.name).toBe("ticker_info")
    expect(IncomeStatementTool.name).toBe("income_statement")
    expect(BalanceSheetTool.name).toBe("balance_sheet")
    expect(CashflowTool.name).toBe("cashflow")
    expect(PriceHistoryTool.name).toBe("price_history")
  })
  test("each input schema requires a ticker", () => {
    for (const t of all) {
      expect(t.inputSchema.safeParse({}).success).toBe(false)
      expect(t.inputSchema.safeParse({ ticker: "AAPL" }).success).toBe(true)
    }
  })
})
