/**
 * Lightweight pub/sub for the user's live credit balance.
 *
 * The Fincept backend returns the current balance in a `Credits-Balance` response header on
 * (at least) every metered call. FinceptClient publishes that value here from EVERY response,
 * and the AuthProvider subscribes — so the displayed balance stays in sync after any call,
 * including agent tool calls (which run through a separate FinceptClient instance). This is the
 * module-level seam that lets core (the client) notify the TUI (auth state) without a direct
 * core→tui import.
 */
type CreditListener = (balance: number) => void

const listeners = new Set<CreditListener>()

/** Subscribe to live credit-balance updates. Returns an unsubscribe function. */
export function subscribeCredits(fn: CreditListener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Publish a fresh balance to all subscribers. A throwing listener never breaks the caller. */
export function publishCredits(balance: number): void {
  for (const fn of listeners) {
    try {
      fn(balance)
    } catch {
      /* a subscriber must never break the HTTP client */
    }
  }
}
