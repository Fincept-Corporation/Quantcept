import { z } from "zod/v4"
import { buildTool } from "../Tool"
import { runYfinance } from "./runYfinance"

export const TickerInfoTool = buildTool({
  name: "ticker_info",
  description:
    "Fetch company info for a stock ticker (name, sector, market cap, P/E, dividend yield, 52-week range, price) via yfinance.",
  inputSchema: z.object({ ticker: z.string() }),
  isReadOnly: () => true,
  async call(input) {
    const r = await runYfinance(input.ticker, "info")
    return "error" in r ? { output: r.error, isError: true } : { output: r.data, title: `info ${input.ticker}` }
  },
})
