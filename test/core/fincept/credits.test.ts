import { afterEach, describe, expect, test } from "bun:test"
import { FinceptClient } from "@core/fincept/client"
import { subscribeCredits } from "@core/fincept/credits"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function mockHeaders(headers: Record<string, string>) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json", ...headers },
    })) as unknown as typeof fetch
}

describe("credit balance pub/sub", () => {
  test("FinceptClient publishes Credits-Balance from any response", async () => {
    const seen: number[] = []
    const unsub = subscribeCredits((b) => seen.push(b))
    mockHeaders({ "Credits-Balance": "287" })
    await new FinceptClient("http://x").request({ method: "GET", path: "/v1/anything", token: "t" })
    unsub()
    expect(seen).toContain(287)
  })

  test("no publish when the header is absent", async () => {
    const seen: number[] = []
    const unsub = subscribeCredits((b) => seen.push(b))
    mockHeaders({})
    await new FinceptClient("http://x").request({ method: "GET", path: "/v1/anything", token: "t" })
    unsub()
    expect(seen).toEqual([])
  })

  test("unsubscribe stops further deliveries", async () => {
    const seen: number[] = []
    const unsub = subscribeCredits((b) => seen.push(b))
    unsub()
    mockHeaders({ "Credits-Balance": "100" })
    await new FinceptClient("http://x").request({ method: "GET", path: "/v1/anything", token: "t" })
    expect(seen).toEqual([])
  })
})
