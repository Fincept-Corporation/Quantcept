import { formatDiagnostics } from "@core/codecheck/format"
import { quantBiasPack } from "@core/codecheck/packs/quant-bias"
import { verify } from "@core/codecheck/verify"
import { z } from "zod/v4"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  code: z.string().describe("The source code to verify."),
  lang: z.enum(["python"]).default("python").describe("Language of the code (only 'python' is supported)."),
})

const PACKS = [quantBiasPack]

export const VerifyCodeTool = buildTool({
  name: "verify_code",
  description:
    "Structurally verify quant/strategy code for lookahead bias and related leakage " +
    "(negative shift, forward indexing, fit-before-split). Returns diagnostics with source " +
    "positions and fixes. Python only. Catches syntactic-pattern bias, not deep dataflow.",
  inputSchema: InputSchema,
  isReadOnly: () => true,
  async call(input) {
    const diags = await verify(input.code, input.lang, PACKS)
    return {
      output: formatDiagnostics(diags),
      title: diags.length ? `${diags.length} issue(s) found` : "no issues",
    }
  },
})
