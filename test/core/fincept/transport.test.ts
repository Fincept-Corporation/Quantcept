import { describe, expect, test } from "bun:test"
import { FinceptClient } from "@core/fincept/client"

const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })

describe("FinceptClient transport seam", () => {
  test("routes the request through an injected transport — no global fetch needed", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const client = new FinceptClient("https://api.example.com/", async (url, init) => {
      calls.push({ url, init })
      return json({ success: true, data: { ok: 1 } }, { "Credits-Balance": "42" })
    })
    const res = await client.request<{ ok: number }>({ method: "GET", path: "/v1/x", token: "fk_user_abc" })
    expect(res.data).toEqual({ ok: 1 })
    expect(res.creditsBalance).toBe(42)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe("https://api.example.com/v1/x") // trailing slash trimmed
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer fk_user_abc")
  })

  test("still maps a 402 envelope to an error through the injected transport", async () => {
    const client = new FinceptClient("https://api.example.com", async () =>
      json({ success: false, error: "insufficient_credits", credits: { required: 5, available: 1 } }, {}, 402),
    )
    await expect(client.request({ method: "GET", path: "/v1/x", token: "t" })).rejects.toThrow()
  })
})
