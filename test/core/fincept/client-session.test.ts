import { expect, test } from "bun:test"
import { FinceptClient } from "@core/fincept/client"
import type { HttpTransport } from "@core/fincept/http"

function capture(): { calls: { url: string; init: RequestInit }[]; transport: HttpTransport } {
  const calls: { url: string; init: RequestInit }[] = []
  const transport: HttpTransport = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ success: true, data: { ok: 1 } }), { status: 200 })
  }
  return { calls, transport }
}

test("sets Authorization and X-Session-Token from the session getter", async () => {
  const { calls, transport } = capture()
  const client = new FinceptClient("https://api.test", transport, () => ({ apiKey: "k", sessionToken: "s" }))
  await client.request({ method: "GET", path: "/x", token: "k" })
  const h = calls[0]!.init.headers as Record<string, string>
  expect(h.Authorization).toBe("Bearer k")
  expect(h["X-Session-Token"]).toBe("s")
})

test("omits X-Session-Token when the session has none", async () => {
  const { calls, transport } = capture()
  const client = new FinceptClient("https://api.test", transport, () => ({ apiKey: "k" }))
  await client.request({ method: "GET", path: "/x", token: "k" })
  const h = calls[0]!.init.headers as Record<string, string>
  expect(h["X-Session-Token"]).toBeUndefined()
})
