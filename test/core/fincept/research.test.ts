import { afterEach, describe, expect, test } from "bun:test"
import { FinceptClient } from "@core/fincept/client"
import { FinceptResearch } from "@core/fincept/research"

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

const body = (init: RequestInit) => JSON.parse(init.body as string)
const res = new FinceptResearch(new FinceptClient("http://x"), () => "fk_user_tok")

describe("FinceptResearch", () => {
  test("llm POSTs prompt + only the set options (undefined omitted)", async () => {
    const calls = capture()
    await res.llm("explain duration", { thinking: true, maxTokens: 1000 })
    expect(calls[0].url).toBe("http://x/v1/research/llm")
    expect(calls[0].init.method).toBe("POST")
    expect(body(calls[0].init)).toEqual({ prompt: "explain duration", thinking: true, max_tokens: 1000 })
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer fk_user_tok")
  })

  test("visualAnalysis POSTs image_url + prompt", async () => {
    const calls = capture()
    await res.visualAnalysis("http://img/chart.png", "what trend?")
    expect(calls[0].url).toBe("http://x/v1/research/visual-analysis")
    expect(body(calls[0].init)).toEqual({ image_url: "http://img/chart.png", prompt: "what trend?" })
  })

  test("grokipedia POSTs slug + flags", async () => {
    const calls = capture()
    await res.grokipedia("federal-reserve", { citations: true, extractRefs: true })
    expect(calls[0].url).toBe("http://x/v1/research/grokipedia")
    expect(body(calls[0].init)).toEqual({ slug: "federal-reserve", extract_refs: true, citations: true })
  })

  test("llmStatus GETs the task path", async () => {
    const calls = capture()
    await res.llmStatus("abc-123")
    expect(calls[0].url).toBe("http://x/v1/research/llm/status/abc-123")
    expect(calls[0].init.method).toBe("GET")
  })

  test("newsEvents GETs with page + limit", async () => {
    const calls = capture()
    await res.newsEvents({ page: 2, limit: 10 })
    expect(calls[0].url).toBe("http://x/v1/research/news-events?page=2&limit=10")
  })
})
