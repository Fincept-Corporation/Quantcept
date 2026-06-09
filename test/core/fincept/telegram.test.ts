import { expect, test } from "bun:test"
import { FinceptClient } from "@core/fincept/client"
import type { HttpTransport } from "@core/fincept/http"
import { FinceptTelegram } from "@core/fincept/telegram"

function spy(data: unknown): { calls: { url: string; method: string }[]; client: FinceptClient } {
  const calls: { url: string; method: string }[] = []
  const transport: HttpTransport = async (url, init) => {
    calls.push({ url, method: (init.method as string) ?? "GET" })
    return new Response(JSON.stringify({ success: true, data }), { status: 200 })
  }
  return { calls, client: new FinceptClient("https://api.test", transport) }
}

test("link() POSTs /v1/telegram/link and returns the deep link", async () => {
  const { calls, client } = spy({ deep_link: "https://t.me/bot?start=tok", token: "tok", expires_in: 600 })
  const tg = new FinceptTelegram(client, () => "k")
  const r = await tg.link()
  expect(calls[0]).toEqual({ url: "https://api.test/v1/telegram/link", method: "POST" })
  expect(r.data.deep_link).toBe("https://t.me/bot?start=tok")
})

test("status() GETs and unlink() DELETEs /v1/telegram/link", async () => {
  const { calls, client } = spy({ linked: true, notify_telegram: true })
  const tg = new FinceptTelegram(client, () => "k")
  await tg.status()
  await tg.unlink()
  expect(calls.map((c) => c.method)).toEqual(["GET", "DELETE"])
})
