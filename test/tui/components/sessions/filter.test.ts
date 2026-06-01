import { describe, expect, test } from "bun:test"
import { filterSessions } from "@tui/components/sessions/filter"

const row = (id: string, title: string | null) => ({ id, title })

describe("filterSessions", () => {
  const rows = [row("a", "Analyze TSLA"), row("b", "Backtest momentum"), row("c", null)]

  test("excludes the current session", () => {
    expect(filterSessions(rows, "", "a").map((r) => r.id)).toEqual(["b", "c"])
  })
  test("case-insensitive title substring", () => {
    expect(filterSessions(rows, "tsla").map((r) => r.id)).toEqual(["a"])
  })
  test("blank query returns all", () => {
    expect(filterSessions(rows, "   ").map((r) => r.id)).toEqual(["a", "b", "c"])
  })
  test("null title never matches a non-empty query", () => {
    expect(filterSessions(rows, "x")).toEqual([])
  })
})
