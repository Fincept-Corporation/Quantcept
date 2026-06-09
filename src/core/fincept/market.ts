import { FinceptResource } from "./resource"

/**
 * Market data over the Fincept backend (/v1/market/* — yfinance bridge, 12h
 * Redis-cached, credit-metered). Returns the raw backend payload (passthrough
 * yfinance JSON) for the agent to consume.
 */
export class FinceptMarket extends FinceptResource {
  private g<T = unknown>(path: string) {
    return this.client.request<T>({ method: "GET", path, token: this.token() })
  }

  search(query: string, limit?: number) {
    return this.g(`/v1/market/search${this.qs({ q: query, limit })}`)
  }
  indices() {
    return this.g("/v1/market/indices")
  }
  price(symbol: string, exchange?: string) {
    return this.g(`/v1/market/ticker/${encodeURIComponent(symbol)}/price${this.qs({ exchange })}`)
  }
  info(symbol: string, exchange?: string) {
    return this.g(`/v1/market/ticker/${encodeURIComponent(symbol)}/info${this.qs({ exchange })}`)
  }
  history(symbol: string, opts?: { period?: string; interval?: string; exchange?: string }) {
    return this.g(
      `/v1/market/ticker/${encodeURIComponent(symbol)}/history${this.qs({ period: opts?.period, interval: opts?.interval, exchange: opts?.exchange })}`,
    )
  }
  financials(symbol: string, opts?: { quarterly?: boolean; exchange?: string }) {
    return this.g(
      `/v1/market/ticker/${encodeURIComponent(symbol)}/financials${this.qs({ quarterly: opts?.quarterly, exchange: opts?.exchange })}`,
    )
  }
  holders(symbol: string, exchange?: string) {
    return this.g(`/v1/market/ticker/${encodeURIComponent(symbol)}/holders${this.qs({ exchange })}`)
  }
  analyst(symbol: string, exchange?: string) {
    return this.g(`/v1/market/ticker/${encodeURIComponent(symbol)}/analyst${this.qs({ exchange })}`)
  }
  dividends(symbol: string, exchange?: string) {
    return this.g(`/v1/market/ticker/${encodeURIComponent(symbol)}/dividends${this.qs({ exchange })}`)
  }
}
