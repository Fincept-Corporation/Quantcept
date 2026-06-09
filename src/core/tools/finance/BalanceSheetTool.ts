import { financeTool } from "./financeTool"

export const BalanceSheetTool = financeTool(
  "balance_sheet",
  "Fetch the annual balance sheet for a stock ticker via yfinance.",
  "balance",
)
