import { formatDiagnostics } from "@core/codecheck/format"
import { quantBiasPack } from "@core/codecheck/packs/quant-bias"
import type { Diagnostic } from "@core/codecheck/types"
import { verify } from "@core/codecheck/verify"

/** Verify a code string and return the formatted report (pure — easy to test). */
export async function verifyText(code: string): Promise<string> {
  const diags = await verify(code, "python", [quantBiasPack])
  return formatDiagnostics(diags)
}

/** Map findings to a process exit code. Errors always fail; warnings fail only under --strict. */
export function exitCodeFor(diags: Diagnostic[], strict: boolean): number {
  if (diags.some((d) => d.severity === "error")) return 1
  if (strict && diags.length > 0) return 1
  return 0
}

/** Warn when the file isn't .py — the verifier parses everything as Python. Null if it's fine. */
export function extensionWarning(file: string): string | null {
  if (file.toLowerCase().endsWith(".py")) return null
  return `warning: '${file}' is not a .py file — it will be parsed as python, results may be meaningless.`
}

/** CLI entrypoint: read the file, print the report, exit non-zero per exitCodeFor. */
export async function runVerifyCli(file: string | undefined, strict = false): Promise<void> {
  if (!file) {
    console.error("usage: quantcept verify <file.py> [--strict]")
    process.exitCode = 2
    return
  }
  const warning = extensionWarning(file)
  if (warning) console.error(warning)

  const code = await Bun.file(file).text()
  const diags = await verify(code, "python", [quantBiasPack])
  console.log(formatDiagnostics(diags))
  process.exitCode = exitCodeFor(diags, strict)
}
