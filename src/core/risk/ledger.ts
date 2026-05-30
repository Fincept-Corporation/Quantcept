// src/core/risk/ledger.ts
//
// PositionLedger — the trusted account/positions/reservations spine.
//
// This is the ONLY component allowed to move cash or change positions, and it
// does so through exactly three public verbs: reserve (TCC Try: freeze buying
// power), release (TCC Cancel), and applyFill (TCC Confirm: a confirmed broker
// fill). There is deliberately NO public cash/position setter — every mutation
// is either a frozen reservation or a real fill, so the ledger can never drift
// from what actually happened at the broker.
//
// It is NOT a Tool. The LLM cannot call it. Higher layers (the order pipeline /
// approval flow) drive it; the model only ever sees derived, read-only numbers.

import type { Database } from "bun:sqlite"
import { openDb } from "@core/storage/db"

export interface LedgerPosition {
  symbol: string
  qty: number
  avgCost: number
}

interface AccountRow {
  id: string
  cash: number
  currency: string
  high_water_mark: number
  realized_pnl_day: number
  pnl_day: string | null
  updated_at: number
}

interface PositionRow {
  account_id: string
  symbol: string
  qty: number
  avg_cost: number
  updated_at: number
}

const DEFAULT_ACCOUNT_ID = "default"
const DEFAULT_STARTING_CASH = 100_000

/** UTC calendar-day key (YYYY-MM-DD) used to bucket realized P&L. */
function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

export class PositionLedger {
  private db: Database
  private ownsDb: boolean
  private accountId: string

  constructor(opts?: { accountId?: string; startingCash?: number; db?: Database }) {
    this.accountId = opts?.accountId ?? DEFAULT_ACCOUNT_ID
    if (opts?.db) {
      this.db = opts.db
      this.ownsDb = false
    } else {
      this.db = openDb()
      this.ownsDb = true
    }
    this.seed(opts?.startingCash ?? DEFAULT_STARTING_CASH)
  }

  // ---------------------------------------------------------------------------
  // Seeding
  // ---------------------------------------------------------------------------

  /**
   * Insert the account row if it does not yet exist. If the row is already
   * present (e.g. a prior process), it is left untouched and `startingCash` is
   * ignored — persistence wins over the constructor argument.
   */
  private seed(startingCash: number): void {
    const existing = this.accountRow()
    if (existing) return
    const now = Date.now()
    this.db
      .query(
        `INSERT INTO account
           (id, cash, currency, high_water_mark, realized_pnl_day, pnl_day, updated_at)
         VALUES (?, ?, 'USD', ?, 0, NULL, ?)`,
      )
      .run(this.accountId, startingCash, startingCash, now)
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  private accountRow(): AccountRow | undefined {
    return this.db.query("SELECT * FROM account WHERE id = ?").get(this.accountId) as AccountRow | undefined
  }

  /** Account row guaranteed to exist (seeded in the constructor). */
  private account(): AccountRow {
    const row = this.accountRow()
    if (!row) throw new Error(`account ${this.accountId} missing`)
    return row
  }

  cash(): number {
    return this.account().cash
  }

  positions(): LedgerPosition[] {
    const rows = this.db
      .query("SELECT * FROM position WHERE account_id = ? ORDER BY symbol ASC")
      .all(this.accountId) as PositionRow[]
    return rows.map((r) => ({ symbol: r.symbol, qty: r.qty, avgCost: r.avg_cost }))
  }

  position(symbol: string): LedgerPosition | undefined {
    const r = this.db.query("SELECT * FROM position WHERE account_id = ? AND symbol = ?").get(this.accountId, symbol) as
      | PositionRow
      | undefined
    if (!r) return undefined
    return { symbol: r.symbol, qty: r.qty, avgCost: r.avg_cost }
  }

  /** Sum of held (not yet released/confirmed) reservation amounts. */
  reservedTotal(): number {
    const r = this.db
      .query("SELECT COALESCE(SUM(amount), 0) AS total FROM reservation WHERE account_id = ? AND status = 'held'")
      .get(this.accountId) as { total: number }
    return r.total
  }

  availableBuyingPower(): number {
    return this.cash() - this.reservedTotal()
  }

  // ---------------------------------------------------------------------------
  // Reservations (TCC Try / Cancel)
  // ---------------------------------------------------------------------------

  /**
   * TCC Try: freeze buying power. Throws if `amount` exceeds the currently
   * available buying power (cash − already-held reservations). Returns the new
   * reservation id.
   */
  reserve(amount: number): string {
    if (amount > this.availableBuyingPower()) {
      throw new Error("insufficient buying power")
    }
    const id = crypto.randomUUID()
    const now = Date.now()
    this.db
      .query("INSERT INTO reservation (id, account_id, amount, status, created_at) VALUES (?, ?, ?, 'held', ?)")
      .run(id, this.accountId, amount, now)
    return id
  }

  /**
   * TCC Cancel: release a held reservation (status → 'released'). No-op if the
   * reservation is unknown or already resolved (released/confirmed).
   */
  release(reservationId: string): void {
    this.db
      .query("UPDATE reservation SET status = 'released' WHERE id = ? AND account_id = ? AND status = 'held'")
      .run(reservationId, this.accountId)
  }

  // ---------------------------------------------------------------------------
  // Fills (TCC Confirm) — the only path that moves cash + positions
  // ---------------------------------------------------------------------------

  /**
   * Confirm a fill. Atomically updates cash + the position row + (optionally)
   * marks the supplied reservation 'confirmed', and accrues realized P&L for
   * the UTC day of `now` on sells.
   *
   *   buy:  cash -= qty*price; avgCost = (oldQty*oldAvg + qty*price)/(oldQty+qty); qty += qty
   *   sell: cash += qty*price; realized += (price - oldAvg)*qty; qty -= qty;
   *         avgCost unchanged; if resulting qty == 0 → delete the position row.
   *
   * After mutating, high_water_mark = max(high_water_mark, cash + Σ qty*avgCost)
   * (cost-basis equity).
   *
   * `now` defaults to Date.now() and is used solely to bucket realized P&L by
   * calendar day; it is an optional 2nd param so tests can inject a fixed clock.
   */
  applyFill(
    f: { reservationId?: string; symbol: string; side: "buy" | "sell"; qty: number; price: number },
    now: number = Date.now(),
  ): void {
    const tx = this.db.transaction(() => {
      const acct = this.account()
      const existing = this.position(f.symbol)
      let cash = acct.cash

      if (f.side === "buy") {
        const oldQty = existing?.qty ?? 0
        const oldAvg = existing?.avgCost ?? 0
        const newQty = oldQty + f.qty
        cash -= f.qty * f.price
        const newAvg = newQty === 0 ? 0 : (oldQty * oldAvg + f.qty * f.price) / newQty
        this.upsertPosition(f.symbol, newQty, newAvg, now)
      } else {
        // sell
        const oldQty = existing?.qty ?? 0
        const oldAvg = existing?.avgCost ?? 0
        const newQty = oldQty - f.qty
        cash += f.qty * f.price
        const realized = (f.price - oldAvg) * f.qty
        this.accrueRealized(acct, realized, now)
        if (newQty === 0) {
          this.db.query("DELETE FROM position WHERE account_id = ? AND symbol = ?").run(this.accountId, f.symbol)
        } else {
          // avgCost is unchanged by a sell.
          this.upsertPosition(f.symbol, newQty, oldAvg, now)
        }
      }

      // Persist cash, then recompute the cost-basis high-water mark.
      const ts = Date.now()
      this.db.query("UPDATE account SET cash = ?, updated_at = ? WHERE id = ?").run(cash, ts, this.accountId)
      this.ratchetHighWater(cash, ts)

      // TCC Confirm: a supplied reservation is now consumed by this fill.
      if (f.reservationId) {
        this.db
          .query("UPDATE reservation SET status = 'confirmed' WHERE id = ? AND account_id = ? AND status = 'held'")
          .run(f.reservationId, this.accountId)
      }
    })
    tx()
  }

  private upsertPosition(symbol: string, qty: number, avgCost: number, now: number): void {
    this.db
      .query(
        `INSERT INTO position (account_id, symbol, qty, avg_cost, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(account_id, symbol)
         DO UPDATE SET qty = excluded.qty, avg_cost = excluded.avg_cost, updated_at = excluded.updated_at`,
      )
      .run(this.accountId, symbol, qty, avgCost, now)
  }

  /** Add `realized` to today's bucket, resetting first if the day rolled over. */
  private accrueRealized(acct: AccountRow, realized: number, now: number): void {
    const today = dayKey(now)
    const base = acct.pnl_day === today ? acct.realized_pnl_day : 0
    const next = base + realized
    this.db
      .query("UPDATE account SET realized_pnl_day = ?, pnl_day = ?, updated_at = ? WHERE id = ?")
      .run(next, today, Date.now(), this.accountId)
  }

  /** high_water_mark = max(current HWM, cash + Σ qty*avgCost) — cost-basis equity. */
  private ratchetHighWater(cash: number, ts: number): void {
    const costBasisEquity = cash + this.positionsCostBasis()
    const hwm = this.account().high_water_mark
    if (costBasisEquity > hwm) {
      this.db
        .query("UPDATE account SET high_water_mark = ?, updated_at = ? WHERE id = ?")
        .run(costBasisEquity, ts, this.accountId)
    }
  }

  private positionsCostBasis(): number {
    let sum = 0
    for (const p of this.positions()) sum += p.qty * p.avgCost
    return sum
  }

  // ---------------------------------------------------------------------------
  // Derived risk reads
  // ---------------------------------------------------------------------------

  /**
   * Realized P&L accrued for the calendar day of `now` (UTC). Returns the
   * stored bucket iff its day matches `now`, otherwise 0 (the bucket is for a
   * different day and is considered reset for today).
   */
  realizedPnlToday(now: number): number {
    const acct = this.account()
    return acct.pnl_day === dayKey(now) ? acct.realized_pnl_day : 0
  }

  /**
   * (high_water_mark − markEquity) / high_water_mark, where
   * markEquity = cash + Σ qty*mark. Clamped to ≥ 0 (never negative). A symbol
   * absent from `markPrices` contributes 0 mark value for that leg.
   */
  drawdownFromHighWater(markPrices: Record<string, number>): number {
    const acct = this.account()
    const hwm = acct.high_water_mark
    if (hwm <= 0) return 0
    let markEquity = acct.cash
    for (const p of this.positions()) {
      const mark = markPrices[p.symbol] ?? 0
      markEquity += p.qty * mark
    }
    const dd = (hwm - markEquity) / hwm
    return dd > 0 ? dd : 0
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  close(): void {
    if (this.ownsDb) this.db.close()
  }
}
