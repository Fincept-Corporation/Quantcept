import { afterEach, describe, expect, test } from "bun:test"
import { FinceptClient } from "@core/fincept/client"
import { FinceptLearnings } from "@core/fincept/learnings"

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

const learn = new FinceptLearnings(new FinceptClient("http://x"), () => "fk_user_tok")

describe("FinceptLearnings", () => {
  test("search encodes q + limit", async () => {
    const calls = capture()
    await learn.search("options hedging", 10)
    expect(calls[0].url).toBe("http://x/v1/learnings/search?q=options+hedging&limit=10")
  })

  test("list / get / download / me paths", async () => {
    const calls = capture()
    await learn.list({ page: 2 })
    await learn.get("lrn_1")
    await learn.download("lrn_1")
    await learn.me()
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "GET http://x/v1/learnings?page=2",
      "GET http://x/v1/learnings/lrn_1",
      "GET http://x/v1/learnings/lrn_1/download",
      "GET http://x/v1/learnings/me",
    ])
  })

  test("flag posts a reason", async () => {
    const calls = capture()
    await learn.flag("lrn_1", "spam")
    expect(`${calls[0].init.method} ${calls[0].url}`).toBe("POST http://x/v1/learnings/lrn_1/flag")
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ reason: "spam" })
  })

  test("upload sends multipart FormData without a JSON content-type", async () => {
    const calls = capture()
    await learn.upload({ title: "Duration 101", content: "# notes", tags: ["bonds", "rates"] })
    expect(calls[0].url).toBe("http://x/v1/learnings")
    expect(calls[0].init.method).toBe("POST")
    const form = calls[0].init.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(form.get("title")).toBe("Duration 101")
    expect(form.get("tags")).toBe("bonds,rates")
    expect(form.get("file")).toBeInstanceOf(Blob)
    // The runtime sets multipart Content-Type with a boundary; we must NOT force application/json.
    const ct = (calls[0].init.headers as Record<string, string>)["Content-Type"]
    expect(ct).toBeUndefined()
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer fk_user_tok")
  })

  test("route posts query with conversation + tools", async () => {
    const calls = capture()
    await learn.route("screen these stocks", { conversationId: "conv_1", availableTools: ["a", "b"] })
    expect(calls[0].url).toBe("http://x/v1/learnings/route")
    expect(calls[0].init.method).toBe("POST")
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      query: "screen these stocks",
      conversation_id: "conv_1",
      available_tools: ["a", "b"],
    })
  })

  test("events posts a batch", async () => {
    const calls = capture()
    await learn.events([{ event: "completed", version_id: 7, generation_pid: "g1" }])
    expect(calls[0].url).toBe("http://x/v1/learnings/events")
    expect(JSON.parse(calls[0].init.body as string).events).toHaveLength(1)
  })

  test("snapshotLatest gets the descriptor", async () => {
    const calls = capture()
    await learn.snapshotLatest()
    expect(calls[0].url).toBe("http://x/v1/learnings/snapshot/latest")
    expect(calls[0].init.method).toBe("GET")
  })
})
