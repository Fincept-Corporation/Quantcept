/**
 * Build a query-string suffix for a Fincept request — `?a=1&b=2`, or "" when there is
 * nothing to send. Skips `undefined` and empty-string values (and a missing params
 * object). The ONE query builder shared by every resource module (previously re-derived
 * as a private `qs()` in market/learnings/sync and inline in research).
 */
export function queryString(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return ""
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.set(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ""
}

/**
 * Pluggable network call: FinceptClient performs the actual request through this, so tests
 * inject a fake transport instead of monkey-patching the global `fetch`. Timeout/abort and
 * envelope/error parsing stay in the client — this is only the raw request.
 */
export type HttpTransport = (url: string, init: RequestInit) => Promise<Response>

export const fetchTransport: HttpTransport = (url, init) => fetch(url, init)
