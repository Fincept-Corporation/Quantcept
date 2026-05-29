import { z } from "zod/v4"
import { buildTool } from "../Tool"
import { runYfinance } from "./runYfinance"

export const IncomeStatementTool = buildTool({
  name: "income_statement",
  description: "Fetch the annual income statement for a stock ticker via yfinance.",
  inputSchema: z.object({ ticker: z.string() }),
  isReadOnly: () => true,
  async call(input) {
    const r = await runYfinance(input.ticker, "income")
    return "error" in r ? { output: r.error, isError: true } : { output: r.data, title: `income ${input.ticker}` }
  },
})
