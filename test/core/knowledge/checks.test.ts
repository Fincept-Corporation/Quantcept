import { describe, expect, test } from "bun:test"
import { evaluateChecks } from "@core/knowledge/checks"
import type { WorkflowCheck } from "@core/knowledge/parser"

const checks: WorkflowCheck[] = [
  { kind: "output_sections", must_include: ["Screen criteria", "Risks"] },
  { kind: "tool_called", tool: "fincept_ticker_financials" },
  { kind: "numbers_cited" },
]

describe("evaluateChecks", () => {
  test("all pass", () => {
    const { results, allPassed } = evaluateChecks(checks, "## Screen criteria\n## Risks", ["fincept_ticker_financials"])
    expect(allPassed).toBe(true)
    expect(results).toHaveLength(3)
    expect(results[2]!.advisory).toBe(true)
  })
  test("missing section fails", () => {
    const { results, allPassed } = evaluateChecks(checks, "## Screen criteria only", ["fincept_ticker_financials"])
    expect(allPassed).toBe(false)
    expect(results[0]!.passed).toBe(false)
    expect(results[0]!.detail).toContain("Risks")
  })
  test("case-insensitive section match", () => {
    const { results } = evaluateChecks(checks.slice(0, 1), "## SCREEN CRITERIA\n## risks", [])
    expect(results[0]!.passed).toBe(true)
  })
  test("missing tool fails", () => {
    const { allPassed } = evaluateChecks(checks, "## Screen criteria\n## Risks", ["other"])
    expect(allPassed).toBe(false)
  })
  test("advisory never blocks; empty checks pass", () => {
    expect(evaluateChecks([{ kind: "numbers_cited" }], "x", []).allPassed).toBe(true)
    expect(evaluateChecks([], "x", []).allPassed).toBe(true)
  })
})
