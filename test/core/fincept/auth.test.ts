import { afterEach, describe, expect, test } from "bun:test"
import { FinceptAuth } from "@core/fincept/auth"
import { FinceptClient } from "@core/fincept/client"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function capture() {
  const calls: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(
      JSON.stringify({ success: true, data: { api_key: "fk_user_z", user_id: "usr_1", account_type: "free" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as unknown as typeof fetch
  return calls
}

describe("FinceptAuth", () => {
  const auth = new FinceptAuth(new FinceptClient("http://x"))

  test("register POSTs /v1/users with the body", async () => {
    const calls = capture()
    await auth.register({ username: "u", email: "e@x.com", password: "p", phone: "9999999999", country: "India", country_code: "+91" })
    expect(calls[0].url).toBe("http://x/v1/users")
    expect(calls[0].init.method).toBe("POST")
    expect(JSON.parse(calls[0].init.body as string).country_code).toBe("+91")
  })

  test("verifyOtp POSTs /v1/sessions/otp and returns api_key", async () => {
    capture()
    const r = await auth.verifyOtp("e@x.com", "123456")
    expect(r.data.api_key).toBe("fk_user_z")
  })

  test("login POSTs /v1/sessions with force_login flag", async () => {
    const calls = capture()
    await auth.login("e@x.com", "p", true)
    expect(calls[0].url).toBe("http://x/v1/sessions")
    expect(JSON.parse(calls[0].init.body as string).force_login).toBe(true)
  })

  test("status sends the bearer token", async () => {
    const calls = capture()
    await auth.status("fk_user_z")
    expect(calls[0].url).toBe("http://x/v1/auth/status")
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer fk_user_z")
  })
})
