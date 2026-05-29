import { z } from "zod/v4"
import { buildTool } from "../Tool"
import { runYfinance } from "./runYfinance"

export const PriceHistoryTool = buildTool({
  name: "price_history",
  description: "Fetch OHLCV price history for a stock ticker via yfinance. period e.g. 1mo, 3mo, 1y (default 1mo).",
  inputSchema: z.object({ ticker: z.string(), period: z.string().optional() }),
  isReadOnly: () => true,
  async call(input) {
    const r = await runYfinance(input.ticker, "history", { period: input.period })
    return "error" in r ? { output: r.error, isError: true } : { output: r.data, title: `history ${input.ticker}` }
  },
})
