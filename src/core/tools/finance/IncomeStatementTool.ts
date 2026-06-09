import { financeTool } from "./financeTool"

export const IncomeStatementTool = financeTool(
  "income_statement",
  "Fetch the annual income statement for a stock ticker via yfinance.",
  "income",
)
