import { afterEach, describe, expect, test } from "bun:test"
import { FinceptClient } from "@core/fincept/client"
import { FinceptSync } from "@core/fincept/sync"

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

const body = (init: RequestInit) => JSON.parse(init.body as string)
const sync = new FinceptSync(new FinceptClient("http://x"), () => "fk_user_tok")

describe("FinceptSync", () => {
  test("settings get/set/bulk shape correctly", async () => {
    const calls = capture()
    await sync.settings.getAll()
    await sync.settings.set("theme", "dark", "ui")
    await sync.settings.setBulk([{ key: "a", value: "b" }])
    expect(calls[0].url).toBe("http://x/v1/settings")
    expect(calls[1].url).toBe("http://x/v1/settings/theme")
    expect(calls[1].init.method).toBe("PUT")
    expect(body(calls[1].init)).toEqual({ value: "dark", category: "ui" })
    expect(calls[2].url).toBe("http://x/v1/settings")
    expect(body(calls[2].init)).toEqual({ settings: [{ key: "a", value: "b" }] })
  })

  test("watchlists CRUD + stock management", async () => {
    const calls = capture()
    await sync.watchlists.list()
    await sync.watchlists.create({ name: "Tech" })
    await sync.watchlists.addStock("wl_1", { symbol: "AAPL" })
    await sync.watchlists.removeStock("wl_1", "AAPL")
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "GET http://x/v1/watchlists",
      "POST http://x/v1/watchlists",
      "POST http://x/v1/watchlists/wl_1/stocks",
      "DELETE http://x/v1/watchlists/wl_1/stocks/AAPL",
    ])
    expect(body(calls[1].init)).toEqual({ name: "Tech" })
    expect(body(calls[2].init)).toEqual({ symbol: "AAPL" })
  })

  test("notes list passes filters; create + favorite shape", async () => {
    const calls = capture()
    await sync.notes.list({ search: "tsla", favorites: true })
    await sync.notes.create({ title: "t", content: "c" })
    await sync.notes.toggleFavorite("n1")
    expect(calls[0].url).toBe("http://x/v1/notes?search=tsla&favorites=true")
    expect(`${calls[1].init.method} ${calls[1].url}`).toBe("POST http://x/v1/notes")
    expect(body(calls[1].init)).toEqual({ title: "t", content: "c" })
    expect(`${calls[2].init.method} ${calls[2].url}`).toBe("PUT http://x/v1/notes/n1/favorite")
  })

  test("portfolio trading sub-endpoint", async () => {
    const calls = capture()
    await sync.portfolios.sell("p1", { symbol: "AAPL", qty: 1 })
    expect(`${calls[0].init.method} ${calls[0].url}`).toBe("POST http://x/v1/portfolios/p1/sell")
    expect(body(calls[0].init)).toEqual({ symbol: "AAPL", qty: 1 })
  })

  test("generic resource() reaches any cloud domain", async () => {
    const calls = capture()
    await sync.resource("/v1/strategies").list()
    expect(calls[0].url).toBe("http://x/v1/strategies")
  })
})
