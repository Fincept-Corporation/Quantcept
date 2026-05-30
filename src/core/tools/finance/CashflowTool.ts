import { z } from "zod/v4"
import { buildTool } from "../Tool"
import { runYfinance } from "./runYfinance"

export const CashflowTool = buildTool({
  name: "cashflow",
  description: "Fetch the annual cash flow statement for a stock ticker via yfinance.",
  inputSchema: z.object({ ticker: z.string() }),
  effectClass: "read",
  isReadOnly: () => true,
  async call(input) {
    const r = await runYfinance(input.ticker, "cashflow")
    return "error" in r ? { output: r.error, isError: true } : { output: r.data, title: `cashflow ${input.ticker}` }
  },
})
