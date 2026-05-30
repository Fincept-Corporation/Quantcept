import { describe, expect, test } from "bun:test"
import type { Order } from "@core/broker"
import { PaperBroker } from "@core/broker"

const buy = (symbol: string, qty: number): Order => ({ symbol, side: "buy", qty, type: "market" })
const sell = (symbol: string, qty: number): Order => ({ symbol, side: "sell", qty, type: "market" })

describe("PaperBroker — getQuote", () => {
  test("returns the seeded price for a known symbol", async () => {
    const b = new PaperBroker({ prices: { AAPL: 150 } })
    expect(await b.getQuote("AAPL")).toEqual({ price: 150 })
  })

  test("falls back to defaultPrice for an unseeded symbol", async () => {
    const b = new PaperBroker({ prices: { AAPL: 150 }, defaultPrice: 42 })
    expect(await b.getQuote("MSFT")).toEqual({ price: 42 })
  })

  test("defaultPrice defaults to 100", async () => {
    const b = new PaperBroker()
    expect(await b.getQuote("NVDA")).toEqual({ price: 100 })
  })
})

describe("PaperBroker — fills + slippage", () => {
  test("a buy fills at price*(1 + slippage)", async () => {
    const b = new PaperBroker({ prices: { AAPL: 100 }, slippageBps: 5 })
    const fill = await b.placeOrder(buy("AAPL", 10), "k1")
    expect(fill.price).toBe(100 * (1 + 5 / 10_000))
    expect(fill.symbol).toBe("AAPL")
    expect(fill.side).toBe("buy")
    expect(fill.qty).toBe(10)
    expect(typeof fill.brokerOrderId).toBe("string")
    expect(typeof fill.ts).toBe("number")
  })

  test("a sell fills at price*(1 - slippage)", async () => {
    const b = new PaperBroker({ prices: { AAPL: 100 }, slippageBps: 5 })
    const fill = await b.placeOrder(sell("AAPL", 4), "k1")
    expect(fill.price).toBe(100 * (1 - 5 / 10_000))
  })

  test("slippageBps defaults to 5", async () => {
    const b = new PaperBroker({ prices: { AAPL: 200 } })
    const fill = await b.placeOrder(buy("AAPL", 1), "k1")
    expect(fill.price).toBe(200 * (1 + 5 / 10_000))
  })

  test("an unseeded symbol fills against defaultPrice", async () => {
    const b = new PaperBroker({ defaultPrice: 100, slippageBps: 5 })
    const fill = await b.placeOrder(buy("ZZZZ", 1), "k1")
    expect(fill.price).toBe(100 * (1 + 5 / 10_000))
  })
})

describe("PaperBroker — idempotency (the anti-double-fill guarantee)", () => {
  test("the SAME key twice returns identical Fill values and books only once", async () => {
    const b = new PaperBroker({ prices: { AAPL: 100 } })
    const first = await b.placeOrder(buy("AAPL", 10), "same-key")
    const second = await b.placeOrder(buy("AAPL", 10), "same-key")

    // Same key → exact same Fill (identity, hence equal values incl. the UUID + ts).
    expect(second).toBe(first)
    expect(second).toEqual(first)
    // And critically: only ONE book entry exists.
    expect(b.book().length).toBe(1)
  })

  test("a replay with the same key ignores the new order args (no second book)", async () => {
    const b = new PaperBroker({ prices: { AAPL: 100, MSFT: 300 } })
    const first = await b.placeOrder(buy("AAPL", 10), "same-key")
    // Replay with a totally different order under the same key.
    const replay = await b.placeOrder(sell("MSFT", 999), "same-key")
    expect(replay).toBe(first)
    expect(b.book().length).toBe(1)
  })

  test("different keys produce two distinct book entries", async () => {
    const b = new PaperBroker({ prices: { AAPL: 100 } })
    const a = await b.placeOrder(buy("AAPL", 10), "k1")
    const c = await b.placeOrder(buy("AAPL", 10), "k2")
    expect(a.brokerOrderId).not.toBe(c.brokerOrderId)
    expect(b.book().length).toBe(2)
  })

  test("book() returns a defensive copy — mutating it does not corrupt the broker", async () => {
    const b = new PaperBroker({ prices: { AAPL: 100 } })
    await b.placeOrder(buy("AAPL", 10), "k1")
    const snapshot = b.book()
    snapshot.pop()
    snapshot[0]?.qty // no-op read
    expect(b.book().length).toBe(1)
  })
})

describe("PaperBroker — cancelOrder", () => {
  test("market orders fill instantly, so there is nothing to cancel → { ok: false }", async () => {
    const b = new PaperBroker({ prices: { AAPL: 100 } })
    const fill = await b.placeOrder(buy("AAPL", 10), "k1")
    expect(await b.cancelOrder(fill.brokerOrderId)).toEqual({ ok: false })
  })

  test("cancelling an unknown order id is also { ok: false }", async () => {
    const b = new PaperBroker()
    expect(await b.cancelOrder("nope")).toEqual({ ok: false })
  })
})
