import { describe, expect, test } from "bun:test"
import { memorySystemBlock } from "@core/memory/prompt"

describe("memorySystemBlock", () => {
  test("empty when both indexes are empty", () => {
    expect(memorySystemBlock("", "")).toBe("")
  })
  test("labels global and project sections", () => {
    const block = memorySystemBlock("- [Prefs](prefs.md) — concise", "- [Port](port.md) — 60% eq")
    expect(block).toContain("Global memory")
    expect(block).toContain("Project memory")
    expect(block).toContain("[Prefs](prefs.md)")
    expect(block).toContain("[Port](port.md)")
    expect(block).toContain("recall")
  })
  test("includes only the non-empty scope", () => {
    const block = memorySystemBlock("", "- [Port](port.md) — x")
    expect(block).toContain("Project memory")
    expect(block).not.toContain("Global memory")
  })
})
