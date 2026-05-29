import { z } from "zod/v4"
import { buildTool } from "../Tool"
import { runYfinance } from "./runYfinance"

export const BalanceSheetTool = buildTool({
  name: "balance_sheet",
  description: "Fetch the annual balance sheet for a stock ticker via yfinance.",
  inputSchema: z.object({ ticker: z.string() }),
  isReadOnly: () => true,
  async call(input) {
    const r = await runYfinance(input.ticker, "balance")
    return "error" in r ? { output: r.error, isError: true } : { output: r.data, title: `balance ${input.ticker}` }
  },
})
