import { afterEach, describe, expect, test } from "bun:test"
import { FinceptBilling } from "@core/fincept/billing"
import { FinceptClient } from "@core/fincept/client"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function capture() {
  const calls: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ success: true, data: { modules: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as unknown as typeof fetch
  return calls
}

const bill = new FinceptBilling(new FinceptClient("http://x"), () => "fk_user_tok")

describe("FinceptBilling", () => {
  test("creditsMap + plans are public GETs (no auth header)", async () => {
    const calls = capture()
    await bill.creditsMap()
    await bill.plans()
    expect(calls[0].url).toBe("http://x/v1/credits/endpoints")
    expect(calls[1].url).toBe("http://x/v1/cashfree/plans")
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  test("subscription + payments carry the token", async () => {
    const calls = capture()
    await bill.subscription()
    await bill.payments()
    expect(calls[0].url).toBe("http://x/v1/cashfree/subscription")
    expect(calls[1].url).toBe("http://x/v1/cashfree/payments")
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer fk_user_tok")
  })

  test("createOrder POSTs plan_id + default USD currency", async () => {
    const calls = capture()
    await bill.createOrder("pro")
    expect(calls[0].url).toBe("http://x/v1/cashfree/create-order")
    expect(calls[0].init.method).toBe("POST")
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ plan_id: "pro", currency: "USD" })
  })

  test("orderStatus encodes the order id into the path", async () => {
    const calls = capture()
    await bill.orderStatus("order_abc123")
    expect(calls[0].url).toBe("http://x/v1/cashfree/order/order_abc123")
  })
})
