import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PositionLedger } from "@core/risk/ledger"

// Fixed clocks (UTC). DAY1 and DAY2 are different calendar days.
const DAY1 = Date.parse("2026-05-30T12:00:00.000Z")
const DAY2 = Date.parse("2026-05-31T12:00:00.000Z")

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-ledger-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("PositionLedger — seeding & persistence", () => {
  test("default starting cash is 100_000", () => {
    const l = new PositionLedger()
    expect(l.cash()).toBe(100_000)
    expect(l.positions()).toEqual([])
    l.close()
  })

  test("custom startingCash is honored", () => {
    const l = new PositionLedger({ startingCash: 50_000 })
    expect(l.cash()).toBe(50_000)
    l.close()
  })

  test("a second ledger against the same DB sees the SAME account; startingCash ignored when row exists", () => {
    const a = new PositionLedger({ accountId: "acct", startingCash: 25_000 })
    a.reserve(5_000)
    a.close()

    // Different startingCash, same accountId → existing row wins.
    const b = new PositionLedger({ accountId: "acct", startingCash: 999_999 })
    expect(b.cash()).toBe(25_000)
    expect(b.reservedTotal()).toBe(5_000)
    b.close()
  })

  test("distinct accountIds are isolated within one DB", () => {
    const a = new PositionLedger({ accountId: "a", startingCash: 10_000 })
    const b = new PositionLedger({ accountId: "b", startingCash: 20_000 })
    a.reserve(1_000)
    expect(a.availableBuyingPower()).toBe(9_000)
    expect(b.availableBuyingPower()).toBe(20_000)
    a.close()
    b.close()
  })
})

describe("PositionLedger — reservations (TCC Try)", () => {
  test("reserve reduces availableBuyingPower; reservedTotal reflects held amount", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    expect(l.availableBuyingPower()).toBe(100_000)
    const id = l.reserve(30_000)
    expect(typeof id).toBe("string")
    expect(l.reservedTotal()).toBe(30_000)
    expect(l.availableBuyingPower()).toBe(70_000)
    // cash itself is NOT moved by a reservation — only frozen.
    expect(l.cash()).toBe(100_000)
    l.close()
  })

  test("reserve beyond available buying power throws", () => {
    const l = new PositionLedger({ startingCash: 1_000 })
    expect(() => l.reserve(1_000.01)).toThrow("insufficient buying power")
    // exactly equal is allowed
    expect(() => l.reserve(1_000)).not.toThrow()
    l.close()
  })

  test("multiple reservations stack and the second is rejected if it exceeds the remainder", () => {
    const l = new PositionLedger({ startingCash: 1_000 })
    l.reserve(600)
    expect(() => l.reserve(500)).toThrow("insufficient buying power")
    expect(l.reservedTotal()).toBe(600)
    l.close()
  })

  test("release restores buying power; double-release is a no-op", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    const id = l.reserve(40_000)
    expect(l.availableBuyingPower()).toBe(60_000)
    l.release(id)
    expect(l.reservedTotal()).toBe(0)
    expect(l.availableBuyingPower()).toBe(100_000)
    // idempotent
    l.release(id)
    expect(l.reservedTotal()).toBe(0)
    l.close()
  })

  test("release of an unknown id is a no-op", () => {
    const l = new PositionLedger()
    expect(() => l.release("does-not-exist")).not.toThrow()
    l.close()
  })
})

describe("PositionLedger — applyFill (buy)", () => {
  test("buy deducts cash and creates a position with avgCost = price", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 10, price: 150 }, DAY1)
    expect(l.cash()).toBe(100_000 - 10 * 150)
    const p = l.position("AAPL")
    expect(p).toEqual({ symbol: "AAPL", qty: 10, avgCost: 150 })
    l.close()
  })

  test("a second buy at a different price yields weighted avgCost and summed qty", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 10, price: 100 }, DAY1)
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 30, price: 200 }, DAY1)
    const p = l.position("AAPL")!
    expect(p.qty).toBe(40)
    // (10*100 + 30*200) / 40 = (1000 + 6000)/40 = 175
    expect(p.avgCost).toBe(175)
    expect(l.cash()).toBe(100_000 - 1000 - 6000)
    l.close()
  })
})

describe("PositionLedger — applyFill (sell)", () => {
  test("sell credits cash, reduces qty, and accrues realized P&L for the day", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 10, price: 100 }, DAY1)
    l.applyFill({ symbol: "AAPL", side: "sell", qty: 4, price: 150 }, DAY1)
    expect(l.cash()).toBe(100_000 - 10 * 100 + 4 * 150)
    const p = l.position("AAPL")!
    expect(p.qty).toBe(6)
    expect(p.avgCost).toBe(100) // avgCost unchanged by a sell
    // realized = (150 - 100) * 4 = 200
    expect(l.realizedPnlToday(DAY1)).toBe(200)
    l.close()
  })

  test("selling the entire position deletes the position row", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 10, price: 100 }, DAY1)
    l.applyFill({ symbol: "AAPL", side: "sell", qty: 10, price: 120 }, DAY1)
    expect(l.position("AAPL")).toBeUndefined()
    expect(l.positions()).toEqual([])
    expect(l.realizedPnlToday(DAY1)).toBe((120 - 100) * 10)
    l.close()
  })

  test("realized P&L resets when the calendar day rolls over", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 10, price: 100 }, DAY1)
    l.applyFill({ symbol: "AAPL", side: "sell", qty: 5, price: 130 }, DAY1)
    expect(l.realizedPnlToday(DAY1)).toBe((130 - 100) * 5) // 150

    // A sell on a new UTC day → today's realized reflects ONLY the new day.
    l.applyFill({ symbol: "AAPL", side: "sell", qty: 5, price: 110 }, DAY2)
    expect(l.realizedPnlToday(DAY2)).toBe((110 - 100) * 5) // 50, not 200
    // Querying with DAY1 now returns 0 (the stored day is DAY2).
    expect(l.realizedPnlToday(DAY1)).toBe(0)
    l.close()
  })

  test("realizedPnlToday returns 0 when no realized P&L was booked for that day", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 10, price: 100 }, DAY1)
    // only a buy happened — no realized P&L
    expect(l.realizedPnlToday(DAY1)).toBe(0)
    l.close()
  })
})

describe("PositionLedger — applyFill with reservationId", () => {
  test("supplying a reservationId marks it confirmed; it stops counting toward reservedTotal", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    const rid = l.reserve(10 * 100)
    expect(l.reservedTotal()).toBe(1_000)
    l.applyFill({ reservationId: rid, symbol: "AAPL", side: "buy", qty: 10, price: 100 }, DAY1)
    expect(l.reservedTotal()).toBe(0)
    expect(l.availableBuyingPower()).toBe(l.cash())
    l.close()
  })
})

describe("PositionLedger — drawdownFromHighWater", () => {
  test("a mark below cost produces a positive drawdown; at/above cost is 0", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 100, price: 100 }, DAY1)
    // After the buy: cash = 90_000, cost-basis equity = 90_000 + 100*100 = 100_000 = HWM.

    // Mark below cost: equity = 90_000 + 100*80 = 98_000 → dd = (100_000 - 98_000)/100_000
    expect(l.drawdownFromHighWater({ AAPL: 80 })).toBeCloseTo(0.02, 10)

    // Mark at cost → 0
    expect(l.drawdownFromHighWater({ AAPL: 100 })).toBe(0)
    // Mark above cost → clamped to 0 (equity above HWM)
    expect(l.drawdownFromHighWater({ AAPL: 200 })).toBe(0)
    l.close()
  })

  test("high-water mark ratchets up on a profitable sell and drawdown is measured from it", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 100, price: 100 }, DAY1)
    // Realize a gain: sell 100 @ 120 → cash = 90_000 + 12_000 = 102_000, no positions.
    l.applyFill({ symbol: "AAPL", side: "sell", qty: 100, price: 120 }, DAY1)
    // cost-basis equity now = cash = 102_000 → HWM ratchets to 102_000.
    // With no positions, markPrices irrelevant; equity = 102_000 = HWM → dd 0.
    expect(l.drawdownFromHighWater({})).toBe(0)

    // Re-enter and mark down to create a drawdown vs the ratcheted HWM.
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 100, price: 100 }, DAY1)
    // cash = 92_000, cost equity = 92_000 + 10_000 = 102_000 (== HWM, no ratchet).
    // Mark @ 90: equity = 92_000 + 9_000 = 101_000 → dd = (102_000-101_000)/102_000
    expect(l.drawdownFromHighWater({ AAPL: 90 })).toBeCloseTo(1_000 / 102_000, 10)
    l.close()
  })
})

describe("PositionLedger — API surface (no public mutator besides reserve/release/applyFill)", () => {
  test("exposes only the documented mutators; no setCash/setPosition/etc.", () => {
    const l = new PositionLedger()
    const proto = Object.getPrototypeOf(l)
    const methods = Object.getOwnPropertyNames(proto).filter(
      (n) => n !== "constructor" && typeof (l as Record<string, unknown>)[n] === "function",
    )
    // The only state-mutating verbs allowed publicly.
    const mutators = methods.filter((m) => /^(set|add|remove|delete|deposit|withdraw|credit|debit|mutate|update)/i.test(m))
    expect(mutators).toEqual([])
    // Sanity: the sanctioned mutators are present.
    expect(methods).toContain("reserve")
    expect(methods).toContain("release")
    expect(methods).toContain("applyFill")
    l.close()
  })
})
