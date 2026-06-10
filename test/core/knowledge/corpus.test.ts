import { describe, expect, test } from "bun:test"
import { localRoute, parseCorpus } from "@core/knowledge/corpus"

const MANIFEST = JSON.stringify({
  schema_version: 1,
  corpus_version: 3,
  built_at: "2026-06-10T00:00:00Z",
  workflows: [
    {
      name: "earnings-quality-screen",
      version: 1,
      title: "Earnings quality screen",
      description: "Screen tickers for earnings quality",
      triggers: ["screen these stocks for earnings quality", "which of these companies has the cleanest earnings"],
      domains: ["equities"],
      tools_required: ["fincept_ticker_financials"],
      checks: [{ kind: "output_sections", must_include: ["Risks"] }],
      body: "## Steps\n1. do",
      performance: 0.5,
    },
    {
      name: "dividend-safety-check",
      version: 1,
      title: "Dividend safety check",
      description: "Judge dividend safety",
      triggers: ["is this dividend safe", "will this company cut its dividend"],
      tools_required: ["fincept_ticker_dividends"],
      checks: [],
      body: "## Steps\n1. do",
      performance: 0.5,
    },
  ],
})

describe("parseCorpus", () => {
  test("parses a manifest", () => {
    const c = parseCorpus(MANIFEST)
    expect(c.corpusVersion).toBe(3)
    expect(c.workflows).toHaveLength(2)
    expect(c.workflows[0]!.toolsRequired).toEqual(["fincept_ticker_financials"])
  })
  test("rejects garbage", () => {
    expect(() => parseCorpus("{}")).toThrow()
    expect(() => parseCorpus("not json")).toThrow()
  })
})

describe("localRoute (offline trigger matching)", () => {
  const corpus = parseCorpus(MANIFEST)
  test("matches a near-trigger query", () => {
    const m = localRoute(corpus, "screen these stocks for earnings quality please", undefined, 0.5)
    expect(m?.name).toBe("earnings-quality-screen")
  })
  test("no match for unrelated query", () => {
    expect(localRoute(corpus, "what is the capital of france", undefined, 0.5)).toBeNull()
  })
  test("tool filter excludes", () => {
    const m = localRoute(corpus, "is this dividend safe", ["some_other_tool"], 0.5)
    expect(m).toBeNull()
  })
  test("empty available tools means unknown catalog (no filter)", () => {
    const m = localRoute(corpus, "is this dividend safe", undefined, 0.5)
    expect(m?.name).toBe("dividend-safety-check")
  })
  test("stop-words alone cannot trigger a match", () => {
    // "is/this/safe" overlap must not bind the dividend workflow to an
    // unrelated safety question (probe-proven false positive pre-hardening).
    expect(localRoute(corpus, "is this safe to eat", undefined, 0.6)).toBeNull()
  })
})
