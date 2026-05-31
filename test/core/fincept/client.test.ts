import { afterEach, describe, expect, test } from "bun:test"
import { FinceptClient } from "@core/fincept/client"
import { FinceptAuthError } from "@shared/errors"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function stub(status: number, body: unknown, headers: Record<string, string> = {}) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    })) as typeof fetch
}

describe("FinceptClient", () => {
  test("returns data + credit headers on success", async () => {
    stub(200, { success: true, data: { ok: 1 } }, { "Credits-Balance": "349", "Credits-Cost": "1" })
    const r = await new FinceptClient("http://x").request<{ ok: number }>({ method: "GET", path: "/v1/x", token: "t" })
    expect(r.data.ok).toBe(1)
    expect(r.creditsBalance).toBe(349)
    expect(r.creditsCost).toBe(1)
  })

  test("401 -> FinceptAuthError", async () => {
    stub(401, { success: false, error: "unauthenticated", message: "Bearer token required" })
    await expect(new FinceptClient("http://x").request({ method: "GET", path: "/v1/users/me" })).rejects.toBeInstanceOf(
      FinceptAuthError,
    )
  })

  test("402 -> InsufficientCreditsError with required/available", async () => {
    stub(402, { success: false, error: "insufficient_credits", credits: { required: 5, available: 2 } })
    const p = new FinceptClient("http://x").request({ method: "POST", path: "/v1/research/llm", token: "t" })
    await expect(p).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS", required: 5, available: 2 })
  })

  test("other non-2xx -> FinceptError with the error code", async () => {
    stub(400, { success: false, error: "username_taken", message: "taken" })
    await expect(
      new FinceptClient("http://x").request({ method: "POST", path: "/v1/users", body: {} }),
    ).rejects.toMatchObject({ code: "username_taken" })
  })

  test("network failure -> FinceptError NETWORK", async () => {
    globalThis.fetch = (async () => {
      throw new Error("boom")
    }) as typeof fetch
    await expect(new FinceptClient("http://x").request({ method: "GET", path: "/health" })).rejects.toMatchObject({
      code: "NETWORK",
    })
  })
})
