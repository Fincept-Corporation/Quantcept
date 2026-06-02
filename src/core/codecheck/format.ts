import type { Diagnostic } from "./types"

const NO_ISSUES =
  "No structural bias detected. (Catches syntactic-pattern bias only — not deep dataflow, " +
  "survivorship, or point-in-time correctness.)"

/** Render diagnostics as plain text for the agent tool and the CLI. Positions are 1-based. */
export function formatDiagnostics(diags: Diagnostic[]): string {
  if (diags.length === 0) return NO_ISSUES
  return diags
    .map((d) => {
      const where = `${d.span.startRow + 1}:${d.span.startCol + 1}`
      const fix = d.fixHint ? `\n  fix: ${d.fixHint}` : ""
      return `${d.severity.toUpperCase()} ${d.ruleId} @ ${where}\n  ${d.message}${fix}`
    })
    .join("\n\n")
}
