import { afterEach, describe, expect, test } from "bun:test"
import { FinceptClient } from "@core/fincept/client"
import { FinceptMarket } from "@core/fincept/market"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function capture() {
  const calls: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ success: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch
  return calls
}

const mkt = new FinceptMarket(new FinceptClient("http://x"), () => "fk_user_tok")

describe("FinceptMarket", () => {
  test("search encodes q + limit", async () => {
    const calls = capture()
    await mkt.search("apple", 5)
    expect(calls[0].url).toBe("http://x/v1/market/search?q=apple&limit=5")
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer fk_user_tok")
  })

  test("price/info/holders/analyst/dividends hit /ticker/:symbol/<kind>", async () => {
    const calls = capture()
    await mkt.price("AAPL")
    await mkt.info("AAPL")
    await mkt.holders("AAPL")
    await mkt.analyst("AAPL")
    await mkt.dividends("AAPL")
    expect(calls.map((c) => c.url)).toEqual([
      "http://x/v1/market/ticker/AAPL/price",
      "http://x/v1/market/ticker/AAPL/info",
      "http://x/v1/market/ticker/AAPL/holders",
      "http://x/v1/market/ticker/AAPL/analyst",
      "http://x/v1/market/ticker/AAPL/dividends",
    ])
  })

  test("history passes period + interval", async () => {
    const calls = capture()
    await mkt.history("RELIANCE", { period: "6mo", interval: "1wk", exchange: "NSE" })
    expect(calls[0].url).toBe("http://x/v1/market/ticker/RELIANCE/history?period=6mo&interval=1wk&exchange=NSE")
  })

  test("financials passes quarterly", async () => {
    const calls = capture()
    await mkt.financials("AAPL", { quarterly: true })
    expect(calls[0].url).toBe("http://x/v1/market/ticker/AAPL/financials?quarterly=true")
  })

  test("indices takes no params", async () => {
    const calls = capture()
    await mkt.indices()
    expect(calls[0].url).toBe("http://x/v1/market/indices")
  })
})
