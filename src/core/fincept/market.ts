import type { FinceptClient } from "./client"

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.set(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ""
}

/**
 * Market data over the Fincept backend (/v1/market/* — yfinance bridge, 12h
 * Redis-cached, credit-metered). Returns the raw backend payload (passthrough
 * yfinance JSON) for the agent to consume.
 */
export class FinceptMarket {
  constructor(
    private readonly client: FinceptClient,
    private readonly token: () => string | undefined,
  ) {}

  private g<T = unknown>(path: string) {
    return this.client.request<T>({ method: "GET", path, token: this.token() })
  }

  search(query: string, limit?: number) {
    return this.g(`/v1/market/search${qs({ q: query, limit })}`)
  }
  indices() {
    return this.g("/v1/market/indices")
  }
  price(symbol: string, exchange?: string) {
    return this.g(`/v1/market/ticker/${encodeURIComponent(symbol)}/price${qs({ exchange })}`)
  }
  info(symbol: string, exchange?: string) {
    return this.g(`/v1/market/ticker/${encodeURIComponent(symbol)}/info${qs({ exchange })}`)
  }
  history(symbol: string, opts?: { period?: string; interval?: string; exchange?: string }) {
    return this.g(
      `/v1/market/ticker/${encodeURIComponent(symbol)}/history${qs({ period: opts?.period, interval: opts?.interval, exchange: opts?.exchange })}`,
    )
  }
  financials(symbol: string, opts?: { quarterly?: boolean; exchange?: string }) {
    return this.g(
      `/v1/market/ticker/${encodeURIComponent(symbol)}/financials${qs({ quarterly: opts?.quarterly, exchange: opts?.exchange })}`,
    )
  }
  holders(symbol: string, exchange?: string) {
    return this.g(`/v1/market/ticker/${encodeURIComponent(symbol)}/holders${qs({ exchange })}`)
  }
  analyst(symbol: string, exchange?: string) {
    return this.g(`/v1/market/ticker/${encodeURIComponent(symbol)}/analyst${qs({ exchange })}`)
  }
  dividends(symbol: string, exchange?: string) {
    return this.g(`/v1/market/ticker/${encodeURIComponent(symbol)}/dividends${qs({ exchange })}`)
  }
}
