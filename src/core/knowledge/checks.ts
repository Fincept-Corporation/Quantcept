import type { WorkflowCheck } from "./parser"

/**
 * Deterministic check evaluator — the TS twin of finceptgo's
 * learnings.EvaluateChecks (keep semantics identical: case-insensitive
 * substring containment for sections; advisory kinds never gate).
 */
export interface CheckResult {
  kind: string
  passed: boolean
  advisory?: boolean
  detail?: string
}

export function evaluateChecks(
  checks: WorkflowCheck[],
  answer: string,
  toolsUsed: string[],
): { results: CheckResult[]; allPassed: boolean } {
  let allPassed = true
  const lower = answer.toLowerCase()
  const used = new Set(toolsUsed)
  const results: CheckResult[] = []
  for (const c of checks) {
    switch (c.kind) {
      case "output_sections": {
        const missing = (c.must_include ?? []).filter((s) => !lower.includes(s.toLowerCase()))
        const passed = missing.length === 0
        if (!passed) allPassed = false
        results.push({ kind: c.kind, passed, detail: passed ? undefined : `missing sections: ${missing.join(", ")}` })
        break
      }
      case "tool_called": {
        const passed = c.tool !== undefined && used.has(c.tool)
        if (!passed) allPassed = false
        results.push({ kind: c.kind, passed, detail: passed ? undefined : `tool ${c.tool} was not called` })
        break
      }
      default:
        results.push({ kind: c.kind, passed: true, advisory: true, detail: "advisory: not evaluated" })
    }
  }
  return { results, allPassed }
}
