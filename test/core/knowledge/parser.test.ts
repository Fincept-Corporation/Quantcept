import { describe, expect, test } from "bun:test"
import { parseWorkflow } from "@core/knowledge/parser"

// Cross-language golden vector — IDENTICAL string pinned in finceptgo
// internal/domain/learnings/workflow_test.go (goldenWorkflow). Change one →
// change both.
const GOLDEN = `---
name: earnings-quality-screen
title: Earnings quality screen
description: Screen a set of tickers for earnings quality using accruals and cash conversion
triggers:
  - screen these stocks for earnings quality
  - which of these companies has the cleanest earnings
domains: [equities, screening]
tools:
  required: [fincept_ticker_financials]
  optional: [fincept_ticker_history]
inputs:
  - name: tickers
    required: true
    description: tickers to screen
checks:
  - kind: output_sections
    must_include: ["Screen criteria", "Results table", "Risks"]
  - kind: tool_called
    tool: fincept_ticker_financials
  - kind: numbers_cited
---

## Steps
1. For each ticker, pull the last 4 annual income statements and cash-flow statements via fincept_ticker_financials.
2. Compute cash conversion = operating cash flow / net income per year; flag any year below 0.8.
3. Compute the accruals ratio = (net income - operating cash flow) / average total assets; flag above 0.1.
4. Rank tickers by average cash conversion (higher is better).

## Output format
Produce exactly three sections: "Screen criteria" (the thresholds used), "Results table" (ticker | cash conversion | accruals flag | rank), and "Risks" (data caveats, one-off items).
`

describe("parseWorkflow", () => {
  test("golden vector parses to the pinned shape", () => {
    const doc = parseWorkflow(GOLDEN)
    expect(doc.name).toBe("earnings-quality-screen")
    expect(doc.title).toBe("Earnings quality screen")
    expect(doc.triggers).toEqual([
      "screen these stocks for earnings quality",
      "which of these companies has the cleanest earnings",
    ])
    expect(doc.domains).toEqual(["equities", "screening"])
    expect(doc.tools.required).toEqual(["fincept_ticker_financials"])
    expect(doc.tools.optional).toEqual(["fincept_ticker_history"])
    expect(doc.inputs).toEqual([{ name: "tickers", required: true, description: "tickers to screen" }])
    expect(doc.checks).toEqual([
      { kind: "output_sections", must_include: ["Screen criteria", "Results table", "Risks"] },
      { kind: "tool_called", tool: "fincept_ticker_financials" },
      { kind: "numbers_cited" },
    ])
    expect(doc.body.startsWith("## Steps")).toBe(true)
    expect(doc.body).toContain("average total assets")
  })

  test("CRLF input parses identically", () => {
    const doc = parseWorkflow(GOLDEN.replaceAll("\n", "\r\n"))
    expect(doc.name).toBe("earnings-quality-screen")
  })

  test("body keeps content after a horizontal rule", () => {
    const doc = parseWorkflow(
      "---\nname: ok-name\ntitle: T\ndescription: d\ntriggers: [x]\n---\n## Steps\n1. one\n\n---\n\nafter the rule\n",
    )
    expect(doc.body).toContain("after the rule")
  })

  test("multibyte title counts code points, not UTF-16 units", () => {
    const title = "株".repeat(100) // 100 code points, 300 UTF-8 bytes
    const doc = parseWorkflow(`---\nname: ok-name\ntitle: ${title}\ndescription: d\ntriggers: [x]\n---\nbody`)
    expect(doc.title).toBe(title)
  })

  test.each([
    ["missing fences", "## Steps\nbody only", /frontmatter/i],
    ["bad name", "---\nname: Bad Name!\ntitle: T\ndescription: d\ntriggers: [x]\n---\nbody", /name/i],
    ["no triggers", "---\nname: ok-name\ntitle: T\ndescription: d\n---\nbody", /trigger/i],
    ["too many triggers", "---\nname: ok-name\ntitle: T\ndescription: d\ntriggers: [a,b,c,d,e,f,g,h,i]\n---\nbody", /trigger/i],
    ["unknown frontmatter key", "---\nname: ok-name\ntitle: T\ndescription: d\ntrigger: [x]\n---\nbody", /frontmatter|unrecognized/i],
    ["unknown check kind", "---\nname: ok-name\ntitle: T\ndescription: d\ntriggers: [x]\nchecks:\n  - kind: nonsense\n---\nbody", /kind/i],
    ["output_sections without must_include", "---\nname: ok-name\ntitle: T\ndescription: d\ntriggers: [x]\nchecks:\n  - kind: output_sections\n---\nbody", /must_include/i],
    ["tool_called without tool", "---\nname: ok-name\ntitle: T\ndescription: d\ntriggers: [x]\nchecks:\n  - kind: tool_called\n---\nbody", /tool/i],
    ["multiline title", '---\nname: ok-name\ntitle: "a\\nb"\ndescription: d\ntriggers: [x]\n---\nbody', /single line/i],
    ["title too many code points", `---\nname: ok-name\ntitle: ${"株".repeat(201)}\ndescription: d\ntriggers: [x]\n---\nbody`, /200/],
    ["empty body", "---\nname: ok-name\ntitle: T\ndescription: d\ntriggers: [x]\n---\n   \n", /body/i],
    ["oversized body", "---\nname: ok-name\ntitle: T\ndescription: d\ntriggers: [x]\n---\n" + "x".repeat(5000), /4096/],
  ])("rejects %s", (_name, raw, msg) => {
    expect(() => parseWorkflow(raw)).toThrow(msg)
  })

  test("huge input without closing fence fails fast (no regex backtracking)", () => {
    const huge = "---\n" + "a: b\n".repeat(200_000) // ~1.4MB, no closing fence
    const start = performance.now()
    expect(() => parseWorkflow(huge)).toThrow(/frontmatter/i)
    expect(performance.now() - start).toBeLessThan(1000)
  })

  test("whitespace-only trigger entries are dropped BEFORE the count check (Go parity)", () => {
    expect(() =>
      parseWorkflow('---\nname: ok-name\ntitle: T\ndescription: d\ntriggers: ["   "]\n---\nbody'),
    ).toThrow(/trigger/i)
  })

  test("whitespace-only domain entry is dropped before the max-10 check (Go parity)", () => {
    const domains = '[a,b,c,d,e,f,g,h,i,j, "   "]'
    const doc = parseWorkflow(
      `---\nname: ok-name\ntitle: T\ndescription: d\ntriggers: [x]\ndomains: ${domains}\n---\nbody`,
    )
    expect(doc.domains).toHaveLength(10)
  })

  test("padded scalar values are trimmed before validation", () => {
    const doc = parseWorkflow('---\nname: ok-name\ntitle: "  T  "\ndescription: " d "\ntriggers: [" x "]\n---\nbody')
    expect(doc.title).toBe("T")
    expect(doc.description).toBe("d")
    expect(doc.triggers).toEqual(["x"])
  })
})
