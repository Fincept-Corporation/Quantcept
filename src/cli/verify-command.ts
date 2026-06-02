import { formatDiagnostics } from "@core/codecheck/format"
import { quantBiasPack } from "@core/codecheck/packs/quant-bias"
import { verify } from "@core/codecheck/verify"

/** Verify a code string and return the formatted report (pure — easy to test). */
export async function verifyText(code: string): Promise<string> {
  const diags = await verify(code, "python", [quantBiasPack])
  return formatDiagnostics(diags)
}

/** CLI entrypoint: read the file, print the report, exit non-zero if any error-severity finding. */
export async function runVerifyCli(file: string | undefined): Promise<void> {
  if (!file) {
    console.error("usage: quantcept verify <file.py>")
    process.exitCode = 2
    return
  }
  const code = await Bun.file(file).text()
  const diags = await verify(code, "python", [quantBiasPack])
  console.log(formatDiagnostics(diags))
  if (diags.some((d) => d.severity === "error")) process.exitCode = 1
}
