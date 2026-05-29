import { describe, expect, test } from "bun:test"
import { resolvePython, runYfinance } from "@core/tools/finance/runYfinance"

const py = resolvePython()

describe("runYfinance", () => {
  test("resolvePython returns a path or null", () => {
    expect(py === null || typeof py === "string").toBe(true)
  })
  test("no python → clear error (only when python is absent)", async () => {
    if (py) return
    const r = await runYfinance("AAPL", "info")
    expect("error" in r).toBe(true)
  })
  test("info returns data with longName/marketCap", async () => {
    if (!py) return
    const r = await runYfinance("AAPL", "info")
    expect("data" in r).toBe(true)
    if ("data" in r) {
      const d = r.data as Record<string, unknown>
      expect(d.longName ?? d.marketCap).toBeDefined()
    }
  })
  test("income returns a data object", async () => {
    if (!py) return
    const r = await runYfinance("AAPL", "income")
    expect("data" in r).toBe(true)
  })
  test("history with period returns dated OHLCV", async () => {
    if (!py) return
    const r = await runYfinance("AAPL", "history", { period: "5d" })
    expect("data" in r).toBe(true)
    if ("data" in r) {
      expect(Object.keys(r.data as Record<string, unknown>).length).toBeGreaterThan(0)
    }
  })
})
