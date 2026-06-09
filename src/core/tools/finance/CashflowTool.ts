import { financeTool } from "./financeTool"

export const CashflowTool = financeTool(
  "cashflow",
  "Fetch the annual cash flow statement for a stock ticker via yfinance.",
  "cashflow",
)
