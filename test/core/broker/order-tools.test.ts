import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createCancelOrderTool,
  createGetPositionsTool,
  createPlaceOrderTool,
  type OrderToolDeps,
} from "@core/broker"
import { PaperBroker } from "@core/broker/paper"
import type { Broker, Fill, Order } from "@core/broker/types"
import { OrderOutbox } from "@core/risk/outbox"
import { PositionLedger } from "@core/risk/ledger"

const CTX = { abort: new AbortController().signal, cwd: "/work" }

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-order-tools-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

/** Build a deps bundle with a fresh ledger/broker/outbox on the temp DB.
 *  `fixedKey`, when set, makes idempotencyKey return the SAME key for every
 *  input — the lever for exercising engine idempotency. */
function makeDeps(opts?: {
  startingCash?: number
  prices?: Record<string, number>
  broker?: Broker
  fixedKey?: string
  onAudit?: (rec: Record<string, unknown>) => void
}): OrderToolDeps & { ledger: PositionLedger; outbox: OrderOutbox; broker: Broker } {
  const ledger = new PositionLedger({ startingCash: opts?.startingCash ?? 100_000 })
  const outbox = new OrderOutbox()
  const broker = opts?.broker ?? new PaperBroker({ prices: opts?.prices ?? { AAPL: 100 }, slippageBps: 0 })
  let counter = 0
  return {
    ledger,
    broker,
    outbox,
    accountId: "default",
    idempotencyKey: (input) =>
      opts?.fixedKey ?? `job-1:step-${counter++}:${input.symbol}:${input.side}:${input.qty}`,
    onAudit: opts?.onAudit,
  }
}

describe("createPlaceOrderTool — happy buy", () => {
  test("fills, moves cash, creates position, marks outbox filled", async () => {
    const deps = makeDeps({ prices: { AAPL: 100 }, fixedKey: "k1" })
    const tool = createPlaceOrderTool(deps)
    const res = await tool.call({ symbol: "AAPL", side: "buy", qty: 10 }, CTX)

    expect(res.isError).toBeFalsy()
    expect(String(res.output)).toContain("Filled")
    const pos = deps.ledger.position("AAPL")
    expect(pos?.qty).toBe(10)

    const row = deps.outbox.get("k1")
    expect(row?.status).toBe("filled")
    const fillPrice = row?.fillPrice ?? 0
    expect(fillPrice).toBeGreaterThan(0)
    // cash decreased by ~ qty * fillPrice
    expect(deps.ledger.cash()).toBeCloseTo(100_000 - 10 * fillPrice, 6)

    deps.ledger.close()
    deps.outbox.close()
  })
})

describe("createPlaceOrderTool — engine idempotency (the headline)", () => {
  test("the SAME key twice fills exactly once; second call replays, no second fill", async () => {
    const deps = makeDeps({ prices: { AAPL: 100 }, fixedKey: "same-key" })
    const tool = createPlaceOrderTool(deps)

    const first = await tool.call({ symbol: "AAPL", side: "buy", qty: 10 }, CTX)
    const second = await tool.call({ symbol: "AAPL", side: "buy", qty: 10 }, CTX)

    expect(String(first.output)).toContain("Filled")
    expect(String(second.output)).toContain("Already filled (idempotent)")
    expect(second.isError).toBeFalsy()

    // Position is 10, NOT 20 — the second placement never reached the broker/ledger.
    expect(deps.ledger.position("AAPL")?.qty).toBe(10)
    // The broker booked exactly one order.
    expect((deps.broker as PaperBroker).book().length).toBe(1)

    deps.ledger.close()
    deps.outbox.close()
  })
})

describe("createPlaceOrderTool — insufficient buying power", () => {
  test("reserve throws → isError, outbox failed, no position, buying power intact", async () => {
    // qty*price = 10*100 = 1000 notional, but only 100 cash → reserve throws.
    const deps = makeDeps({ startingCash: 100, prices: { AAPL: 100 }, fixedKey: "k-poor" })
    const tool = createPlaceOrderTool(deps)
    const res = await tool.call({ symbol: "AAPL", side: "buy", qty: 10 }, CTX)

    expect(res.isError).toBe(true)
    expect(String(res.output)).toContain("Order failed")
    expect(deps.outbox.get("k-poor")?.status).toBe("failed")
    expect(deps.ledger.position("AAPL")).toBeUndefined()
    // reserve threw BEFORE any reservation was created → buying power fully intact.
    expect(deps.ledger.reservedTotal()).toBe(0)
    expect(deps.ledger.availableBuyingPower()).toBe(100)

    deps.ledger.close()
    deps.outbox.close()
  })
})

describe("createPlaceOrderTool — broker failure path", () => {
  test("broker rejects → reservation released, outbox failed, no position", async () => {
    const boom: Broker = {
      async getQuote() {
        return { price: 100 }
      },
      async placeOrder(_o: Order, _k: string): Promise<Fill> {
        throw new Error("broker down")
      },
      async cancelOrder() {
        return { ok: false }
      },
    }
    const deps = makeDeps({ startingCash: 100_000, broker: boom, fixedKey: "k-boom" })
    const tool = createPlaceOrderTool(deps)
    const res = await tool.call({ symbol: "AAPL", side: "buy", qty: 10 }, CTX)

    expect(res.isError).toBe(true)
    expect(String(res.output)).toContain("Order failed")
    expect(String(res.output)).toContain("broker down")
    expect(deps.outbox.get("k-boom")?.status).toBe("failed")
    expect(deps.ledger.position("AAPL")).toBeUndefined()
    // The TCC Try reservation must have been released (Cancel) → buying power restored.
    expect(deps.ledger.reservedTotal()).toBe(0)
    expect(deps.ledger.availableBuyingPower()).toBe(100_000)

    deps.ledger.close()
    deps.outbox.close()
  })
})

describe("createCancelOrderTool", () => {
  test("returns the irreversible explanation, not an error throw", async () => {
    const deps = makeDeps()
    const tool = createCancelOrderTool(deps)
    const res = await tool.call({ brokerOrderId: "abc123" }, CTX)

    expect(res.isError).toBeFalsy()
    expect(String(res.output)).toContain("Cannot cancel abc123")
    expect(String(res.output)).toContain("offsetting order")

    deps.ledger.close()
    deps.outbox.close()
  })
})

describe("createGetPositionsTool", () => {
  test("reflects the ledger after a fill; effectClass read", async () => {
    const deps = makeDeps({ prices: { AAPL: 100 }, fixedKey: "k-gp" })
    const place = createPlaceOrderTool(deps)
    await place.call({ symbol: "AAPL", side: "buy", qty: 10 }, CTX)

    const get = createGetPositionsTool(deps)
    expect(get.effectClass).toBe("read")
    expect(get.isReadOnly({})).toBe(true)

    const res = await get.call({}, CTX)
    const parsed = JSON.parse(String(res.output)) as {
      cash: number
      positions: { symbol: string; qty: number; avgCost: number }[]
    }
    expect(parsed.cash).toBeCloseTo(deps.ledger.cash(), 6)
    expect(parsed.positions).toEqual([{ symbol: "AAPL", qty: 10, avgCost: parsed.positions[0]?.avgCost ?? 0 }])
    expect(parsed.positions[0]?.qty).toBe(10)

    deps.ledger.close()
    deps.outbox.close()
  })
})

describe("order tools — effect classes", () => {
  test("place_order is irreversible; cancel_order is compensable", () => {
    const deps = makeDeps()
    expect(createPlaceOrderTool(deps).effectClass).toBe("irreversible")
    expect(createCancelOrderTool(deps).effectClass).toBe("compensable")
    deps.ledger.close()
    deps.outbox.close()
  })
})

describe("createPlaceOrderTool — onAudit ordering", () => {
  test("a happy buy emits intent then fill (in that order)", async () => {
    const seen: string[] = []
    const deps = makeDeps({
      prices: { AAPL: 100 },
      fixedKey: "k-audit",
      onAudit: (rec) => seen.push(String(rec.kind)),
    })
    const tool = createPlaceOrderTool(deps)
    await tool.call({ symbol: "AAPL", side: "buy", qty: 10 }, CTX)

    const intentIdx = seen.indexOf("intent")
    const fillIdx = seen.indexOf("fill")
    expect(intentIdx).toBeGreaterThanOrEqual(0)
    expect(fillIdx).toBeGreaterThanOrEqual(0)
    expect(intentIdx).toBeLessThan(fillIdx)

    deps.ledger.close()
    deps.outbox.close()
  })
})
