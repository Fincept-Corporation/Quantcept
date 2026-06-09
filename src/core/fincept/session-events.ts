/**
 * Module-level pub/sub for single-session enforcement. When the backend reports the device's
 * session was taken over elsewhere (401 `session_invalidated`), FinceptClient publishes here and
 * the AuthProvider subscribes — clearing creds and re-gating reactively, with no polling. Mirrors
 * the credits.ts seam: it lets core (the client) notify the TUI (auth state) without a core→tui import.
 */
type Listener = (reason: string) => void

const listeners = new Set<Listener>()

/** Subscribe to session-invalidation events. Returns an unsubscribe function. */
export function subscribeSessionInvalidated(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Broadcast that the current session is dead. A throwing listener never breaks the caller. */
export function publishSessionInvalidated(reason: string): void {
  for (const fn of listeners) {
    try {
      fn(reason)
    } catch {
      /* a subscriber must never break the HTTP client */
    }
  }
}
