import { afterEach, describe, expect, test } from "bun:test"
import { FinceptAccount } from "@core/fincept/account"
import { FinceptClient } from "@core/fincept/client"
import { FinceptAuthError } from "@shared/errors"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function capture() {
  const calls: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ success: true, data: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch
  return calls
}

const acct = new FinceptAccount(new FinceptClient("http://x"), () => "fk_user_tok")

describe("FinceptAccount", () => {
  test("every call carries the bearer token", async () => {
    const calls = capture()
    await acct.me()
    expect(calls[0].url).toBe("http://x/v1/users/me")
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer fk_user_tok")
  })

  test("updateProfile PUTs /v1/users/me with the patch", async () => {
    const calls = capture()
    await acct.updateProfile({ username: "neo", country_code: "+1" })
    expect(calls[0].url).toBe("http://x/v1/users/me")
    expect(calls[0].init.method).toBe("PUT")
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ username: "neo", country_code: "+1" })
  })

  test("changePassword POSTs snake_case body", async () => {
    const calls = capture()
    await acct.changePassword("old1", "new2")
    expect(calls[0].url).toBe("http://x/v1/users/me/change-password")
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ old_password: "old1", new_password: "new2" })
  })

  test("markNotificationRead targets the id path", async () => {
    const calls = capture()
    await acct.markNotificationRead(42)
    expect(calls[0].url).toBe("http://x/v1/users/me/notifications/42/read")
    expect(calls[0].init.method).toBe("PUT")
  })

  test("mfaDisable DELETEs with the password", async () => {
    const calls = capture()
    await acct.mfaDisable("pw")
    expect(calls[0].url).toBe("http://x/v1/users/me/mfa")
    expect(calls[0].init.method).toBe("DELETE")
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ password: "pw" })
  })

  test("subscribeDatabase POSTs database_name", async () => {
    const calls = capture()
    await acct.subscribeDatabase("ceic")
    expect(calls[0].url).toBe("http://x/v1/users/me/database-subscriptions")
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ database_name: "ceic" })
  })

  test("usage/transactions/login-history/notifications/subscriptions are GETs", async () => {
    const calls = capture()
    await acct.usage()
    await acct.transactions()
    await acct.loginHistory()
    await acct.notifications()
    await acct.subscriptions()
    expect(calls.map((c) => c.url)).toEqual([
      "http://x/v1/users/me/usage",
      "http://x/v1/users/me/transactions",
      "http://x/v1/users/me/login-history",
      "http://x/v1/users/me/notifications",
      "http://x/v1/users/me/database-subscriptions",
    ])
    expect(calls.every((c) => (c.init.method ?? "GET") === "GET")).toBe(true)
  })

  test("throws FinceptAuthError when no token", async () => {
    const noTok = new FinceptAccount(new FinceptClient("http://x"), () => undefined)
    expect(() => noTok.me()).toThrow(FinceptAuthError)
  })
})
