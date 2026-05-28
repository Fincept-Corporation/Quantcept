import { z } from "zod/v4"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  operation: z.enum(["cagr", "simple_return", "percent_change"]),
  begin: z.number(),
  end: z.number(),
  years: z.number().positive().optional(),
})

export const CalculatorTool = buildTool({
  name: "calculator",
  description:
    "Finance calculator. Operations: cagr (compound annual growth rate, requires years), simple_return, percent_change.",
  inputSchema: InputSchema,
  isReadOnly: () => true,
  async call(input) {
    let result: number
    switch (input.operation) {
      case "cagr": {
        const years = input.years ?? 1
        result = (input.end / input.begin) ** (1 / years) - 1
        break
      }
      case "simple_return":
      case "percent_change":
        result = (input.end - input.begin) / input.begin
        break
    }
    return { output: { result }, title: `${input.operation} = ${result.toFixed(4)}` }
  },
})
