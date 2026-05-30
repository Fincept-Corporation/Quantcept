import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkRisk, type ProposedOrder, type RiskLimits } from "@core/risk/limits"
import { PositionLedger } from "@core/risk/ledger"

// Fixed UTC clock for the daily-loss day bucket.
const DAY1 = Date.parse("2026-05-30T12:00:00.000Z")

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-risk-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

function order(over: Partial<ProposedOrder> = {}): ProposedOrder {
  return { symbol: "AAPL", side: "buy", qty: 10, estPrice: 100, ...over }
}

describe("checkRisk — within limits", () => {
  test("an order inside every cap → { ok: true }", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    const limits: RiskLimits = {
      maxOrderNotional: 10_000,
      maxDailyLossUsd: 5_000,
      maxDrawdownPct: 50,
      maxPositionQtyPerSymbol: 1_000,
    }
    const v = checkRisk(l, order({ qty: 10, estPrice: 100 }), limits, { AAPL: 100 }, DAY1)
    expect(v).toEqual({ ok: true })
    l.close()
  })

  test("no limits set → always ok (buying power still enforced separately)", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    const v = checkRisk(l, order({ qty: 1, estPrice: 1 }), {}, {}, DAY1)
    expect(v.ok).toBe(true)
    l.close()
  })
})

describe("checkRisk — maxOrderNotional", () => {
  test("notional over the cap is denied", () => {
    const l = new PositionLedger({ startingCash: 1_000_000 })
    const v = checkRisk(l, order({ qty: 100, estPrice: 200 }), { maxOrderNotional: 10_000 }, {}, DAY1)
    expect(v.ok).toBe(false)
    expect(v.violation).toBe("maxOrderNotional")
    l.close()
  })

  test("notional exactly at the cap is allowed (strict >)", () => {
    const l = new PositionLedger({ startingCash: 1_000_000 })
    const v = checkRisk(l, order({ qty: 100, estPrice: 100 }), { maxOrderNotional: 10_000 }, {}, DAY1)
    expect(v.ok).toBe(true)
    l.close()
  })
})

describe("checkRisk — maxDailyLossUsd", () => {
  test("a realized loss beyond the limit is denied", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    // Buy 100 @ 100, then sell 100 @ 90 → realized P&L = (90-100)*100 = -1000 (a $1000 loss).
    l.applyFill({ symbol: "MSFT", side: "buy", qty: 100, price: 100 }, DAY1)
    l.applyFill({ symbol: "MSFT", side: "sell", qty: 100, price: 90 }, DAY1)
    expect(l.realizedPnlToday(DAY1)).toBe(-1000)
    const v = checkRisk(l, order({ qty: 1, estPrice: 1 }), { maxDailyLossUsd: 500 }, {}, DAY1)
    expect(v.ok).toBe(false)
    expect(v.violation).toBe("maxDailyLossUsd")
    l.close()
  })

  test("a realized gain does not trip the daily-loss limit", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    l.applyFill({ symbol: "MSFT", side: "buy", qty: 100, price: 100 }, DAY1)
    l.applyFill({ symbol: "MSFT", side: "sell", qty: 100, price: 120 }, DAY1) // +2000 gain
    const v = checkRisk(l, order({ qty: 1, estPrice: 1 }), { maxDailyLossUsd: 500 }, {}, DAY1)
    expect(v.ok).toBe(true)
    l.close()
  })
})

describe("checkRisk — maxDrawdownPct", () => {
  test("a mark below cost producing a drawdown over the limit is denied", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 100, price: 100 }, DAY1)
    // HWM = 100_000. Mark @ 80 → equity 98_000 → dd 2%. Limit 1% → denied.
    const v = checkRisk(l, order({ qty: 1, estPrice: 1 }), { maxDrawdownPct: 1 }, { AAPL: 80 }, DAY1)
    expect(v.ok).toBe(false)
    expect(v.violation).toBe("maxDrawdownPct")
    l.close()
  })

  test("a drawdown within the limit is allowed", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 100, price: 100 }, DAY1)
    // dd 2% < 5% limit.
    const v = checkRisk(l, order({ qty: 1, estPrice: 1 }), { maxDrawdownPct: 5 }, { AAPL: 80 }, DAY1)
    expect(v.ok).toBe(true)
    l.close()
  })
})

describe("checkRisk — maxPositionQtyPerSymbol", () => {
  test("a buy that would push the position over the cap is denied", () => {
    const l = new PositionLedger({ startingCash: 1_000_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 90, price: 100 }, DAY1)
    // current 90 + buy 20 = 110 > 100 → denied.
    const v = checkRisk(l, order({ symbol: "AAPL", side: "buy", qty: 20, estPrice: 100 }), { maxPositionQtyPerSymbol: 100 }, {}, DAY1)
    expect(v.ok).toBe(false)
    expect(v.violation).toBe("maxPositionQtyPerSymbol")
    l.close()
  })

  test("a sell is not governed by the per-symbol position cap", () => {
    const l = new PositionLedger({ startingCash: 1_000_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 90, price: 100 }, DAY1)
    const v = checkRisk(l, order({ symbol: "AAPL", side: "sell", qty: 1000, estPrice: 100 }), { maxPositionQtyPerSymbol: 100 }, {}, DAY1)
    expect(v.violation).not.toBe("maxPositionQtyPerSymbol")
    l.close()
  })

  test("a buy that lands exactly at the cap is allowed (strict >)", () => {
    const l = new PositionLedger({ startingCash: 1_000_000 })
    l.applyFill({ symbol: "AAPL", side: "buy", qty: 90, price: 100 }, DAY1)
    const v = checkRisk(l, order({ symbol: "AAPL", side: "buy", qty: 10, estPrice: 100 }), { maxPositionQtyPerSymbol: 100 }, {}, DAY1)
    expect(v.ok).toBe(true)
    l.close()
  })
})

describe("checkRisk — buying power (ledger-derived, spoof-proof)", () => {
  test("a buy whose notional exceeds available buying power is denied", () => {
    const l = new PositionLedger({ startingCash: 1_000 })
    const v = checkRisk(l, order({ qty: 100, estPrice: 100 }), {}, {}, DAY1) // notional 10_000 > 1_000
    expect(v.ok).toBe(false)
    expect(v.violation).toBe("buyingPower")
    l.close()
  })

  test("buying power comes from the LEDGER, not the args — a spoofed estPrice cannot widen it", () => {
    const l = new PositionLedger({ startingCash: 1_000 })
    // The model "claims" a tiny price so notional looks affordable, but the qty*estPrice notional
    // is what's checked against ledger.availableBuyingPower(). A spoof that lowers estPrice also
    // lowers the notional — it can never grant MORE buying power than the ledger holds.
    // Here notional 5_000 > available 1_000 → still denied regardless of any claimed figure.
    const v = checkRisk(l, order({ qty: 50, estPrice: 100 }), {}, {}, DAY1)
    expect(v.ok).toBe(false)
    expect(v.violation).toBe("buyingPower")
    // And reserved funds reduce ledger buying power, independent of order args.
    l.reserve(900) // available now 100
    const v2 = checkRisk(l, order({ qty: 2, estPrice: 100 }), {}, {}, DAY1) // notional 200 > 100
    expect(v2.ok).toBe(false)
    expect(v2.violation).toBe("buyingPower")
    l.close()
  })

  test("a buy within available buying power passes", () => {
    const l = new PositionLedger({ startingCash: 100_000 })
    const v = checkRisk(l, order({ qty: 100, estPrice: 100 }), {}, {}, DAY1) // 10_000 <= 100_000
    expect(v.ok).toBe(true)
    l.close()
  })
})

describe("checkRisk — exported from @core/risk", () => {
  test("checkRisk is re-exported from the risk barrel", async () => {
    const mod = await import("@core/risk")
    expect(typeof (mod as { checkRisk?: unknown }).checkRisk).toBe("function")
  })
})
