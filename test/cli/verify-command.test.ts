import { describe, expect, test } from "bun:test"
import { exitCodeFor, extensionWarning, verifyText } from "@cli/verify-command"
import type { Diagnostic } from "@core/codecheck/types"

const span = { byteStart: 0, byteEnd: 0, startRow: 0, startCol: 0, endRow: 0, endCol: 0, text: "" }
const err: Diagnostic = { ruleId: "x", severity: "error", span, message: "" }
const warn: Diagnostic = { ruleId: "y", severity: "warn", span, message: "" }

describe("verifyText", () => {
  test("returns formatted diagnostics for biased python", async () => {
    const out = await verifyText('df["y"] = df["px"].shift(-1)')
    expect(out).toContain("bias/lookahead-shift")
  })

  test("returns the no-issues message for clean code", async () => {
    expect(await verifyText("y = 1")).toContain("No structural bias")
  })
})

describe("exitCodeFor", () => {
  test("clean -> 0", () => {
    expect(exitCodeFor([], false)).toBe(0)
  })

  test("error-severity -> 1 regardless of strict", () => {
    expect(exitCodeFor([err], false)).toBe(1)
    expect(exitCodeFor([err], true)).toBe(1)
  })

  test("warn-only -> 0 by default, 1 under strict", () => {
    expect(exitCodeFor([warn], false)).toBe(0)
    expect(exitCodeFor([warn], true)).toBe(1)
  })
})

describe("extensionWarning", () => {
  test("null for a .py file", () => {
    expect(extensionWarning("strat.py")).toBeNull()
  })

  test("warns for a non-.py file (parsed as python anyway)", () => {
    expect(extensionWarning("strat.js")).toContain("python")
  })

  test("case-insensitive on extension", () => {
    expect(extensionWarning("Strat.PY")).toBeNull()
  })
})
