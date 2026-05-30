// src/core/broker/types.ts
//
// Broker contract — the narrow seam between the order pipeline and whatever
// actually fills (a paper broker today, a real broker behind an adapter later).
//
// The single non-negotiable guarantee lives on `placeOrder`: it MUST be
// idempotent on the engine-supplied `idempotencyKey`. The killer insight from
// the trade-safety research is that an LLM re-synthesizes a DIFFERENT key on a
// retry, so the key cannot come from the model — the engine owns it, and the
// broker (plus the durable outbox) dedupes on it so a retried placement can
// never double-fill.

export interface Order {
  symbol: string
  side: "buy" | "sell"
  qty: number
  type: "market"
}

export interface Fill {
  brokerOrderId: string
  symbol: string
  side: "buy" | "sell"
  qty: number
  price: number
  ts: number
}

export interface Broker {
  getQuote(symbol: string): Promise<{ price: number }>
  /** Place an order. MUST be idempotent on `idempotencyKey`: the same key returns the same Fill and books only once. */
  placeOrder(order: Order, idempotencyKey: string): Promise<Fill>
  cancelOrder(brokerOrderId: string): Promise<{ ok: boolean }>
}
