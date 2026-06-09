import { describe, expect, test } from "bun:test"
import { createFinceptTools } from "@core/fincept/tools"

const WRITE_TOOLS = ["fincept_watchlist_add", "fincept_note_save", "fincept_learnings_publish"]

describe("createFinceptTools", () => {
  const tools = createFinceptTools()
  const names = tools.map((t) => t.name)

  test("exposes the full, uniquely-named tool set", () => {
    expect(tools.length).toBe(24)
    expect(new Set(names).size).toBe(names.length)
    for (const n of [
      "fincept_market_search",
      "fincept_ticker_price",
      "fincept_ticker_financials",
      "fincept_research_llm",
      "fincept_grokipedia",
      "fincept_watchlist_list",
      "fincept_notes_list",
      "fincept_portfolio_list",
      "fincept_learnings_search",
      "fincept_learnings_read",
      ...WRITE_TOOLS,
    ]) {
      expect(names).toContain(n)
    }
  })

  test("only the three cloud-write tools are write / not-read-only", () => {
    for (const t of tools) {
      expect(t.isReadOnly({} as never)).toBe(!WRITE_TOOLS.includes(t.name))
    }
  })
})
