import { z } from "zod/v4"
import { buildTool } from "../Tool"
import { runYfinance, type YfKind } from "./runYfinance"

/**
 * Build a read-only single-ticker yfinance tool. The statement-style finance tools
 * (info / income / balance / cashflow) differ ONLY in name, description, and kind — so
 * each is one factory call instead of a copy-pasted `buildTool` block. price_history
 * keeps its own definition (it takes an extra `period`). The result title is
 * `${kind} ${ticker}`, and a sidecar error maps to an `isError` result.
 */
export function financeTool(name: string, description: string, kind: Exclude<YfKind, "history">) {
  return buildTool({
    name,
    description,
    inputSchema: z.object({ ticker: z.string() }),
    effectClass: "read",
    isReadOnly: () => true,
    async call(input) {
      const r = await runYfinance(input.ticker, kind)
      return "error" in r ? { output: r.error, isError: true } : { output: r.data, title: `${kind} ${input.ticker}` }
    },
  })
}
