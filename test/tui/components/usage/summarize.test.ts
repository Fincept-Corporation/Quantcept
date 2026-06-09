import type { UsageEntry } from "@core/fincept"
import { summarizeUsage } from "@tui/components/usage/summarize"
import { describe, expect, test } from "bun:test"

const entry = (over: Partial<UsageEntry>): UsageEntry => ({
  endpoint: "/v1/chat/conversations/x/messages",
  method: "POST",
  credits_used: 1,
  response_time_ms: 100,
  status_code: 200,
  created_at: "2026-06-08T10:00:00Z",
  ...over,
})

describe("summarizeUsage", () => {
  test("empty input yields zeroed totals and no rows", () => {
    const s = summarizeUsage([])
    expect(s).toEqual({ totalCredits: 0, totalCalls: 0, avgLatencyMs: 0, byEndpoint: [] })
  })

  test("sums credits, counts calls, and averages latency (rounded)", () => {
    const s = summarizeUsage([
      entry({ credits_used: 5, response_time_ms: 100 }),
      entry({ credits_used: 3, response_time_ms: 51 }),
    ])
    expect(s.totalCredits).toBe(8)
    expect(s.totalCalls).toBe(2)
    expect(s.avgLatencyMs).toBe(76) // round((100+51)/2)
  })

  test("groups by method+endpoint and sorts by credits desc, then calls desc", () => {
    const s = summarizeUsage([
      entry({ endpoint: "/v1/market/ticker/AAPL", method: "GET", credits_used: 1 }),
      entry({ endpoint: "/v1/market/ticker/MSFT", method: "GET", credits_used: 1 }), // same method, different path key
      entry({ endpoint: "/v1/research/llm", method: "POST", credits_used: 8 }),
      entry({ endpoint: "/v1/research/llm", method: "POST", credits_used: 4 }),
    ])
    // research/llm: 12 cr / 2 calls (top); each market ticker: 1 cr / 1 call
    expect(s.byEndpoint[0]).toEqual({ method: "POST", endpoint: "/v1/research/llm", credits: 12, calls: 2 })
    expect(s.byEndpoint.length).toBe(3)
    expect(s.totalCredits).toBe(14)
  })

  test("distinguishes the same endpoint under different methods", () => {
    const s = summarizeUsage([
      entry({ endpoint: "/v1/learnings", method: "GET", credits_used: 0 }),
      entry({ endpoint: "/v1/learnings", method: "POST", credits_used: 3 }),
    ])
    expect(s.byEndpoint.length).toBe(2)
    const post = s.byEndpoint.find((r) => r.method === "POST")
    expect(post).toEqual({ method: "POST", endpoint: "/v1/learnings", credits: 3, calls: 1 })
  })
})
