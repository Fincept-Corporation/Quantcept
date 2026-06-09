import { financeTool } from "./financeTool"

export const TickerInfoTool = financeTool(
  "ticker_info",
  "Fetch company info for a stock ticker (name, sector, market cap, P/E, dividend yield, 52-week range, price) via yfinance.",
  "info",
)
