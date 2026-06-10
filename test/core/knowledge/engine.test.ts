import { describe, expect, test } from "bun:test"
import { parseCorpus } from "@core/knowledge/corpus"
import { buildWorkflowSystemBlock, KnowledgeEngine } from "@core/knowledge/engine"

const corpus = parseCorpus(
  JSON.stringify({
    schema_version: 1,
    corpus_version: 1,
    workflows: [
      {
        name: "dividend-safety-check",
        version: 1,
        version_id: 42,
        title: "Dividend safety check",
        description: "d",
        triggers: ["is this dividend safe"],
        tools_required: [],
        checks: [{ kind: "output_sections", must_include: ["Verdict"] }],
        body: "## Steps\n1. judge",
        performance: 0.5,
      },
    ],
  }),
)

describe("KnowledgeEngine.route", () => {
  test("prefers the server match", async () => {
    const eng = new KnowledgeEngine({
      remoteRoute: async () => ({
        route_id: 9,
        version_id: 7,
        id: "lrn_x",
        name: "dividend-safety-check",
        version: 1,
        title: "Dividend safety check",
        body: "## Steps",
        performance: 0.5,
        score: 0.9,
      }),
      loadCorpus: async () => corpus,
      reportEvents: async () => {},
    })
    const m = await eng.route("is this dividend safe", { conversationId: "c1" })
    expect(m?.source).toBe("server")
    expect(m?.versionId).toBe(7)
    // Server matches don't carry checks on the wire; resolve them locally.
    expect(m?.checks).toHaveLength(1)
  })

  test("falls back to local corpus when the server is unreachable", async () => {
    const eng = new KnowledgeEngine({
      remoteRoute: async () => {
        throw new Error("offline")
      },
      loadCorpus: async () => corpus,
      reportEvents: async () => {},
      // Trigger tokens {dividend, safe} → floor-3 denominator → 0.667 overlap;
      // the production default is 0.7, so the fallback test pins the knob at
      // 0.6 to document that an exact-trigger query routes locally.
      localThreshold: 0.6,
    })
    const m = await eng.route("is this dividend safe", {})
    expect(m?.source).toBe("local")
    expect(m?.name).toBe("dividend-safety-check")
    expect(m?.versionId).toBe(42)
    expect(m?.checks).toHaveLength(1)
  })

  test("no match anywhere → null", async () => {
    const eng = new KnowledgeEngine({
      remoteRoute: async () => null,
      loadCorpus: async () => corpus,
      reportEvents: async () => {},
    })
    expect(await eng.route("capital of france", {})).toBeNull()
  })

  test("reportOutcome evaluates checks and ships events", async () => {
    const shipped: unknown[] = []
    const eng = new KnowledgeEngine({
      remoteRoute: async () => {
        throw new Error("offline")
      },
      loadCorpus: async () => corpus,
      reportEvents: async (events) => {
        shipped.push(...events)
      },
      localThreshold: 0.6,
    })
    const local = await eng.route("is this dividend safe", {})
    await eng.reportOutcome(local!, { answer: "## Verdict SAFE", toolsUsed: [], generationId: "g1" })
    expect(shipped).toHaveLength(2) // completed + checks_passed
  })
})

describe("buildWorkflowSystemBlock", () => {
  test("carries the mandate + body", () => {
    const block = buildWorkflowSystemBlock({ title: "T", body: "## Steps\n1. x" })
    expect(block).toContain("Mandated workflow: T")
    expect(block).toContain("## Steps")
    expect(block.toLowerCase()).toContain("follow")
  })
})
