import { expect, test } from "bun:test"
import { FinceptClient } from "@core/fincept/client"
import type { HttpTransport } from "@core/fincept/http"
import { FinceptAuthError, SocialLoginRequiredError } from "@shared/errors"
import { subscribeSessionInvalidated } from "@core/fincept/session-events"

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

function failing(status: number, code: string): HttpTransport {
  return async () => new Response(JSON.stringify({ success: false, error: code, message: code }), { status })
}

test("401 session_invalidated publishes the seam and throws FinceptAuthError", async () => {
  let reason = ""
  const off = subscribeSessionInvalidated((r) => { reason = r })
  const client = new FinceptClient("https://api.test", failing(401, "session_invalidated"))
  await expect(client.request({ method: "GET", path: "/x", token: "k" })).rejects.toBeInstanceOf(FinceptAuthError)
  off()
  expect(reason).toBe("session_invalidated")
})

test("401 use_social_login throws SocialLoginRequiredError", async () => {
  const client = new FinceptClient("https://api.test", failing(401, "use_social_login"))
  await expect(client.request({ method: "GET", path: "/x", token: "k" })).rejects.toBeInstanceOf(SocialLoginRequiredError)
})

test("other 401 throws plain FinceptAuthError without publishing", async () => {
  let published = false
  const off = subscribeSessionInvalidated(() => { published = true })
  const client = new FinceptClient("https://api.test", failing(401, "invalid_api_key"))
  await expect(client.request({ method: "GET", path: "/x", token: "k" })).rejects.toBeInstanceOf(FinceptAuthError)
  off()
  expect(published).toBe(false)
})
