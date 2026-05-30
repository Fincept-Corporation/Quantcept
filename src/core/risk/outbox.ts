// src/core/risk/outbox.ts
//
// OrderOutbox — the durable, crash-safe transactional outbox over the
// `order_outbox` table. It is the anti-double-fill spine: the order pipeline
// writes the INTENT (keyed by the engine-supplied idempotency key) BEFORE it
// ever calls the broker, so a crash between "intent written" and "broker called"
// leaves a recoverable `pending` row, and a retry that re-uses the same key is
// rejected as a duplicate instead of placing a second order.
//
// The dedupe lives in the PRIMARY KEY (idempotency_key) + `INSERT ... ON CONFLICT
// DO NOTHING`: `writeIntent` is a pure no-op on a key it has already seen. This
// is the durable arm of the guarantee; PaperBroker carries the in-process arm.
//
// Like PositionLedger, this is NOT a Tool — the LLM never touches it. Higher
// layers drive it; the key is owned by the engine, never by the model.

import type { Database } from "bun:sqlite"
import { openDb } from "@core/storage/db"

export interface OutboxRow {
  idempotencyKey: string
  accountId: string
  symbol: string
  side: "buy" | "sell"
  qty: number
  status: "pending" | "filled" | "failed"
  brokerOrderId?: string
  fillPrice?: number
  createdAt: number
  updatedAt: number
}

interface OutboxDbRow {
  idempotency_key: string
  account_id: string
  symbol: string
  side: "buy" | "sell"
  qty: number
  status: "pending" | "filled" | "failed"
  broker_order_id: string | null
  fill_price: number | null
  created_at: number
  updated_at: number
}

function toRow(r: OutboxDbRow): OutboxRow {
  return {
    idempotencyKey: r.idempotency_key,
    accountId: r.account_id,
    symbol: r.symbol,
    side: r.side,
    qty: r.qty,
    status: r.status,
    brokerOrderId: r.broker_order_id ?? undefined,
    fillPrice: r.fill_price ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export class OrderOutbox {
  private db: Database
  private ownsDb: boolean

  constructor(opts?: { db?: Database }) {
    if (opts?.db) {
      this.db = opts.db
      this.ownsDb = false
    } else {
      this.db = openDb()
      this.ownsDb = true
    }
  }

  /**
   * Write the order intent BEFORE calling the broker. Dedupe on the idempotency
   * key: returns "new" if this call inserted the row, "exists" if the key was
   * already present (in which case nothing is written). The PRIMARY KEY +
   * ON CONFLICT DO NOTHING makes this atomic and crash-safe.
   */
  writeIntent(key: string, o: { accountId: string; symbol: string; side: "buy" | "sell"; qty: number }): "new" | "exists" {
    const now = Date.now()
    const res = this.db
      .query(
        `INSERT INTO order_outbox
           (idempotency_key, account_id, symbol, side, qty, status, broker_order_id, fill_price, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)
         ON CONFLICT(idempotency_key) DO NOTHING`,
      )
      .run(key, o.accountId, o.symbol, o.side, o.qty, now, now)
    // `changes` is 1 on a fresh insert, 0 when the conflict clause swallowed it.
    return res.changes > 0 ? "new" : "exists"
  }

  get(key: string): OutboxRow | undefined {
    const r = this.db.query("SELECT * FROM order_outbox WHERE idempotency_key = ?").get(key) as OutboxDbRow | undefined
    return r ? toRow(r) : undefined
  }

  /** Mark a written intent filled: record the broker order id + fill price. */
  markFilled(key: string, fill: { brokerOrderId: string; fillPrice: number }): void {
    this.db
      .query(
        `UPDATE order_outbox
           SET status = 'filled', broker_order_id = ?, fill_price = ?, updated_at = ?
         WHERE idempotency_key = ?`,
      )
      .run(fill.brokerOrderId, fill.fillPrice, Date.now(), key)
  }

  /** Mark a written intent failed (the broker placement did not succeed). */
  markFailed(key: string): void {
    this.db
      .query("UPDATE order_outbox SET status = 'failed', updated_at = ? WHERE idempotency_key = ?")
      .run(Date.now(), key)
  }

  /** All intents still awaiting a broker outcome (oldest first). */
  pending(): OutboxRow[] {
    const rows = this.db
      .query("SELECT * FROM order_outbox WHERE status = 'pending' ORDER BY created_at ASC")
      .all() as OutboxDbRow[]
    return rows.map(toRow)
  }

  close(): void {
    if (this.ownsDb) this.db.close()
  }
}
