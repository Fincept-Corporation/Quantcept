import { z } from "zod/v4"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  operation: z.enum(["cagr", "simple_return", "percent_change", "sharpe_ratio", "annualized_vol"]),
  // cagr / simple_return / percent_change
  begin: z.number().optional(),
  end: z.number().optional(),
  years: z.number().positive().optional(),
  // sharpe_ratio: all values as decimals (e.g. 0.12 for 12%)
  portfolio_return: z.number().optional(),
  risk_free_rate: z.number().optional(),
  std_dev: z.number().optional(),
  // annualized_vol
  daily_std_dev: z.number().optional(),
  trading_days: z.number().positive().optional(),
})

export const CalculatorTool = buildTool({
  name: "calculator",
  description:
    "Finance calculator. Operations: " +
    "cagr (requires begin/end/years), " +
    "simple_return / percent_change (requires begin/end), " +
    "sharpe_ratio (requires portfolio_return, risk_free_rate, std_dev — all decimals e.g. 0.12 for 12%), " +
    "annualized_vol (requires daily_std_dev; trading_days defaults to 252).",
  inputSchema: InputSchema,
  isReadOnly: () => true,
  async call(input) {
    let result: number
    switch (input.operation) {
      case "cagr": {
        if (input.begin == null || input.end == null) return { output: "cagr requires begin and end", isError: true }
        result = (input.end / input.begin) ** (1 / (input.years ?? 1)) - 1
        break
      }
      case "simple_return":
      case "percent_change": {
        if (input.begin == null || input.end == null)
          return { output: `${input.operation} requires begin and end`, isError: true }
        result = (input.end - input.begin) / input.begin
        break
      }
      case "sharpe_ratio": {
        if (input.portfolio_return == null || input.risk_free_rate == null || input.std_dev == null)
          return { output: "sharpe_ratio requires portfolio_return, risk_free_rate, and std_dev", isError: true }
        if (input.std_dev === 0) return { output: "sharpe_ratio: std_dev cannot be zero", isError: true }
        result = (input.portfolio_return - input.risk_free_rate) / input.std_dev
        break
      }
      case "annualized_vol": {
        if (input.daily_std_dev == null) return { output: "annualized_vol requires daily_std_dev", isError: true }
        result = input.daily_std_dev * Math.sqrt(input.trading_days ?? 252)
        break
      }
    }
    return { output: result!.toFixed(6), title: `${input.operation} = ${result!.toFixed(4)}` }
  },
})
