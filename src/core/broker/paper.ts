// src/core/broker/paper.ts
//
// PaperBroker — an in-memory simulated broker for backtests, demos, and the
// trade-safety test rig. It fills market orders instantly against a seeded (or
// default) price with a fixed slippage, and is strictly idempotent on the
// engine-supplied idempotency key.
//
// Idempotency lives in two places by design: the durable OrderOutbox (crash-safe
// dedupe) AND here in the broker (an in-process replay guard). This file is the
// second floor — even if a caller bypasses the outbox and replays the same key,
// the broker returns the SAME Fill and never adds a second book entry.

import type { Broker, Fill, Order } from "./types"

export interface PaperBrokerOpts {
  prices?: Record<string, number>
  slippageBps?: number
  defaultPrice?: number
}

const DEFAULT_SLIPPAGE_BPS = 5
const DEFAULT_PRICE = 100

export class PaperBroker implements Broker {
  private prices: Record<string, number>
  private slippageBps: number
  private defaultPrice: number

  // The anti-double-fill guarantee: one Fill per idempotency key, forever.
  private fills = new Map<string, Fill>()
  // Append-only record of every distinct booked fill (one per distinct key).
  private bookEntries: Fill[] = []

  constructor(opts?: PaperBrokerOpts) {
    this.prices = { ...(opts?.prices ?? {}) }
    this.slippageBps = opts?.slippageBps ?? DEFAULT_SLIPPAGE_BPS
    this.defaultPrice = opts?.defaultPrice ?? DEFAULT_PRICE
  }

  async getQuote(symbol: string): Promise<{ price: number }> {
    return { price: this.prices[symbol] ?? this.defaultPrice }
  }

  /**
   * Place a market order, idempotent on `idempotencyKey`. If the key has been
   * seen before, the EXACT same Fill is returned and no second book entry is
   * created — this is the in-process arm of the anti-double-fill guarantee.
   *
   * Otherwise the order fills instantly at the quoted price adjusted by
   * slippage (buys pay up, sells receive less), is recorded under the key and
   * in the book, and the new Fill is returned.
   */
  async placeOrder(order: Order, idempotencyKey: string): Promise<Fill> {
    const existing = this.fills.get(idempotencyKey)
    if (existing) return existing

    const { price } = await this.getQuote(order.symbol)
    const slip = this.slippageBps / 10_000
    const fillPrice = order.side === "buy" ? price * (1 + slip) : price * (1 - slip)

    const fill: Fill = {
      brokerOrderId: crypto.randomUUID(),
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      price: fillPrice,
      ts: Date.now(),
    }
    this.fills.set(idempotencyKey, fill)
    this.bookEntries.push(fill)
    return fill
  }

  /**
   * Market orders fill instantly, so by the time an order id exists it has
   * already been booked — there is nothing left to cancel. Always `{ ok: false }`.
   */
  async cancelOrder(_brokerOrderId: string): Promise<{ ok: boolean }> {
    return { ok: false }
  }

  /** Test helper: read-only copy of every booked fill (one per distinct key). */
  book(): Fill[] {
    return this.bookEntries.map((f) => ({ ...f }))
  }
}
