import { describe, expect, test } from "bun:test"
import { labelFor } from "@core/tools/shell/labels"

describe("labelFor", () => {
  test("known unix command → label + risky flag", () => {
    expect(labelFor("rm")).toEqual({ label: "⚠ Deletes files", risky: true })
    expect(labelFor("duckdb")).toEqual({ label: "Query data", risky: false })
  })
  test("known PowerShell command (PascalCase)", () => {
    expect(labelFor("Remove-Item")).toEqual({ label: "⚠ Deletes items", risky: true })
    expect(labelFor("Get-ChildItem")).toEqual({ label: "List items", risky: false })
  })
  test("unknown command → empty label, not risky", () => {
    expect(labelFor("frobnicate")).toEqual({ label: "", risky: false })
  })
})
