import { describe, expect, test } from "bun:test"
import { formatApproval } from "@core/tools/shell/format"
import type { CommandPart } from "@core/tools/shell/parse"

describe("formatApproval", () => {
  test("formats labeled parts with risk glyphs", () => {
    const parts: CommandPart[] = [
      { name: "duckdb", text: "duckdb q.sql", label: "Query data", risky: false },
      { name: "rm", text: "rm -rf x", label: "⚠ Deletes files", risky: true },
    ]
    const out = formatApproval(parts)
    expect(out).toContain("This will run:")
    expect(out).toContain("⊙ duckdb — Query data")
    expect(out).toContain("⚠ rm — ⚠ Deletes files")
  })
  test("unknown command (empty label) shows just the name", () => {
    const out = formatApproval([{ name: "frob", text: "frob -x", label: "", risky: false }])
    expect(out).toContain("⊙ frob")
    expect(out).not.toContain("frob — ")
  })
  test("empty parts → generic message", () => {
    expect(formatApproval([])).toBe("Run this command?")
  })
})
