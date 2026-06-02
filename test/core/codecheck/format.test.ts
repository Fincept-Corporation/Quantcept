import { describe, expect, test } from "bun:test"
import { formatDiagnostics } from "@core/codecheck/format"

describe("formatDiagnostics", () => {
  test("empty list explains the no-issue case and its limits", () => {
    const out = formatDiagnostics([])
    expect(out).toContain("No structural bias")
    expect(out.toLowerCase()).toContain("dataflow")
  })

  test("renders rule id, 1-based position, message and fix", () => {
    const out = formatDiagnostics([
      {
        ruleId: "bias/lookahead-shift",
        severity: "error",
        message: "peeks the future",
        fixHint: "use shift(n) n>0",
        span: { byteStart: 0, byteEnd: 5, startRow: 2, startCol: 4, endRow: 2, endCol: 9, text: "x" },
      },
    ])
    expect(out).toContain("ERROR bias/lookahead-shift")
    expect(out).toContain("3:5")
    expect(out).toContain("peeks the future")
    expect(out).toContain("use shift(n) n>0")
  })
})
