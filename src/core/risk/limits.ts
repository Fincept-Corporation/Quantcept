// src/core/risk/limits.ts
//
// Hard pre-trade risk limits — the agent-immutable predicates of the reference
// monitor. Every figure that bounds a limit (cash, open position, realized P&L,
// drawdown) is read from the TRUSTED PositionLedger, never from the order args
// the model supplies. A violation is a HARD deny: it is surfaced as a plain
// error by the executor, NOT a gate, so it can never be approved away.

import type { PositionLedger } from "./ledger"

export interface RiskLimits {
  maxOrderNotional?: number
  maxDailyLossUsd?: number
  maxDrawdownPct?: number // percent, e.g. 20 = 20%
  maxPositionQtyPerSymbol?: number
}

export interface ProposedOrder {
  symbol: string
  side: "buy" | "sell"
  qty: number
  estPrice: number
}

export interface RiskVerdict {
  ok: boolean
  violation?: string
  detail?: string
}

/**
 * Hard pre-trade risk check against the TRUSTED ledger. All position/cash/PnL figures
 * come from the ledger (never from the order args), so spoofed tool input cannot widen a limit.
 * `now` is injected for testability (daily-loss day bucket). `markPrices` feeds drawdown.
 */
export function checkRisk(
  ledger: PositionLedger,
  order: ProposedOrder,
  limits: RiskLimits,
  markPrices: Record<string, number>,
  now: number,
): RiskVerdict {
  const notional = order.qty * order.estPrice
  if (limits.maxOrderNotional !== undefined && notional > limits.maxOrderNotional)
    return {
      ok: false,
      violation: "maxOrderNotional",
      detail: `order notional ${notional} > cap ${limits.maxOrderNotional}`,
    }
  if (limits.maxDailyLossUsd !== undefined) {
    const lossToday = -ledger.realizedPnlToday(now) // realized loss is negative PnL
    if (lossToday > limits.maxDailyLossUsd)
      return {
        ok: false,
        violation: "maxDailyLossUsd",
        detail: `today's loss ${lossToday} > limit ${limits.maxDailyLossUsd}`,
      }
  }
  if (limits.maxDrawdownPct !== undefined) {
    const ddPct = ledger.drawdownFromHighWater(markPrices) * 100
    if (ddPct > limits.maxDrawdownPct)
      return {
        ok: false,
        violation: "maxDrawdownPct",
        detail: `drawdown ${ddPct.toFixed(1)}% > limit ${limits.maxDrawdownPct}%`,
      }
  }
  if (limits.maxPositionQtyPerSymbol !== undefined && order.side === "buy") {
    const cur = ledger.position(order.symbol)?.qty ?? 0
    if (cur + order.qty > limits.maxPositionQtyPerSymbol)
      return {
        ok: false,
        violation: "maxPositionQtyPerSymbol",
        detail: `position ${cur + order.qty} > limit ${limits.maxPositionQtyPerSymbol}`,
      }
  }
  if (order.side === "buy" && notional > ledger.availableBuyingPower())
    return {
      ok: false,
      violation: "buyingPower",
      detail: `notional ${notional} > available ${ledger.availableBuyingPower()}`,
    }
  return { ok: true }
}
