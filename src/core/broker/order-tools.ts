// src/core/broker/order-tools.ts
//
// Order tools — the LLM-facing trading verbs, wired as a TCC saga over the
// trusted spine (ledger + outbox + broker). These are the ONLY tools that can
// move real buying power, so every floor of the trade-safety research lands here:
//
//   • Engine idempotency — the idempotency key is supplied by the engine
//     (jobId/sessionId + step), NEVER by the model. A retried placement under the
//     same key replays the recorded fill instead of double-filling.
//   • Transactional outbox — the durable intent is written BEFORE the broker call,
//     so a crash leaves a recoverable row, never a silent double order.
//   • TCC (Try/Confirm/Cancel) — reserve buying power (Try), confirm on a real
//     fill (Confirm), release on any failure (Cancel). Reservations can never leak.
//
// place_order is `irreversible` (a real fill cannot be undone); cancel_order is
// `compensable` (it explains the offsetting-order pivot rather than auto-rolling
// back a fill); get_positions is `read`.

import type { PositionLedger } from "@core/risk/ledger"
import type { OrderOutbox } from "@core/risk/outbox"
import { buildTool, type Tool } from "@core/tools/Tool"
import { z } from "zod/v4"
import type { Broker } from "./types"

export interface OrderToolDeps {
  ledger: PositionLedger
  broker: Broker
  outbox: OrderOutbox
  accountId: string
  /** Engine-supplied idempotency key — derived from the execution context (jobId/sessionId + step),
   *  NEVER from the LLM's tool args. Stable across retries of the SAME logical order, unique otherwise. */
  idempotencyKey: (input: { symbol: string; side: "buy" | "sell"; qty: number }) => string
  onAudit?: (rec: Record<string, unknown>) => void // Phase 7 wires the real audit; default no-op
}

const PlaceOrderInput = z.object({
  symbol: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  qty: z.number().positive(),
})

/**
 * place_order — the TCC saga. effectClass `irreversible`.
 *
 * Flow (all idempotent on the engine key):
 *   1. If the outbox already has a `filled` row for this key, REPLAY it — return
 *      the recorded fill with no second placement (engine idempotency).
 *   2. Quote → write the durable intent (BEFORE the broker call).
 *   3. reserve() the notional (TCC Try).
 *   4. broker.placeOrder(..., key) — idempotent on the key.
 *   5. markFilled() the outbox, then applyFill() the ledger (TCC Confirm).
 *   On any throw: markFailed() the outbox and release() the reservation (TCC Cancel).
 *
 * Known crash window (paper-v1): between markFilled() and applyFill() a process
 * crash would leave the outbox `filled` but the ledger un-updated. The OUTBOX is
 * the source of truth; a real implementation reconciles the ledger forward from
 * filled outbox rows on startup. Acceptable for paper-v1.
 */
export function createPlaceOrderTool(deps: OrderToolDeps): Tool<typeof PlaceOrderInput, string> {
  return buildTool({
    name: "place_order",
    description:
      "Place a market order (paper broker). Reserves buying power, fills, and updates the ledger. " +
      "Idempotent: a retried placement under the same engine key never double-fills.",
    inputSchema: PlaceOrderInput,
    effectClass: "irreversible",
    async call(input) {
      const key = deps.idempotencyKey(input)

      const prior = deps.outbox.get(key)
      if (prior?.status === "filled") {
        // Already executed under this key — return the recorded fill, NO second fill (engine idempotency).
        deps.onAudit?.({
          kind: "replay",
          key,
          symbol: input.symbol,
          brokerOrderId: prior.brokerOrderId,
          price: prior.fillPrice,
        })
        return {
          output: `Already filled (idempotent): ${input.side} ${input.qty} ${input.symbol} @ ${prior.fillPrice} (order ${prior.brokerOrderId})`,
          title: "place_order (replayed)",
        }
      }

      const quote = await deps.broker.getQuote(input.symbol)
      const notional = input.qty * quote.price

      // Durable intent BEFORE the broker call (transactional outbox).
      deps.outbox.writeIntent(key, {
        accountId: deps.accountId,
        symbol: input.symbol,
        side: input.side,
        qty: input.qty,
      })
      deps.onAudit?.({
        kind: "intent",
        key,
        symbol: input.symbol,
        side: input.side,
        qty: input.qty,
        estPrice: quote.price,
      })

      let resId: string | undefined
      try {
        resId = deps.ledger.reserve(notional) // TCC Try
        deps.onAudit?.({ kind: "reserve", key, amount: notional, reservationId: resId })

        const fill = await deps.broker.placeOrder(
          { symbol: input.symbol, side: input.side, qty: input.qty, type: "market" },
          key,
        ) // idempotent on key

        deps.outbox.markFilled(key, { brokerOrderId: fill.brokerOrderId, fillPrice: fill.price })
        deps.ledger.applyFill({
          reservationId: resId,
          symbol: input.symbol,
          side: input.side,
          qty: input.qty,
          price: fill.price,
        }) // Confirm
        deps.onAudit?.({
          kind: "fill",
          key,
          symbol: input.symbol,
          side: input.side,
          qty: input.qty,
          price: fill.price,
          brokerOrderId: fill.brokerOrderId,
        })

        return {
          output: `Filled ${input.side} ${input.qty} ${input.symbol} @ ${fill.price.toFixed(2)} (order ${fill.brokerOrderId}). Cash: ${deps.ledger.cash().toFixed(2)}`,
          title: `place_order ${fill.brokerOrderId}`,
        }
      } catch (e) {
        deps.outbox.markFailed(key)
        if (resId) deps.ledger.release(resId) // Cancel the reservation
        deps.onAudit?.({ kind: "failed", key, error: String(e) })
        return { output: `Order failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
      }
    },
  })
}

const CancelOrderInput = z.object({ brokerOrderId: z.string() })

/**
 * cancel_order — effectClass `compensable`. Paper market orders fill immediately,
 * so there is nothing to cancel; rather than auto-rolling back a real fill (the
 * research's pivot rule: never auto-reverse), it explains the offsetting-order exit.
 */
export function createCancelOrderTool(deps: OrderToolDeps): Tool<typeof CancelOrderInput, string> {
  return buildTool({
    name: "cancel_order",
    description:
      "Attempt to cancel an order. Market orders fill immediately and cannot be cancelled — " +
      "exit by placing an offsetting order instead.",
    inputSchema: CancelOrderInput,
    effectClass: "compensable",
    async call(input) {
      await deps.broker.cancelOrder(input.brokerOrderId)
      // Paper market orders are already filled → cancelOrder returns { ok: false }.
      // We do NOT auto-rollback the fill; we explain the offsetting-order pivot.
      return {
        output: `Cannot cancel ${input.brokerOrderId}: market orders fill immediately and are irreversible. To exit, place an offsetting order (it will execute at the current price, not the original).`,
        isError: false,
      }
    },
  })
}

const GetPositionsInput = z.object({})

/**
 * get_positions — effectClass `read`. Returns the ledger's cash + positions as
 * JSON. The model only ever sees these derived, read-only numbers.
 */
export function createGetPositionsTool(deps: OrderToolDeps): Tool<typeof GetPositionsInput, string> {
  return buildTool({
    name: "get_positions",
    description: "Read the current account: cash balance and open positions (symbol, qty, avgCost).",
    inputSchema: GetPositionsInput,
    effectClass: "read",
    isReadOnly: () => true,
    async call() {
      return {
        output: JSON.stringify({ cash: deps.ledger.cash(), positions: deps.ledger.positions() }),
        title: "get_positions",
      }
    },
  })
}
