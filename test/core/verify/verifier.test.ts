import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Job, JobTurn } from "@core/jobs/types"
import type { ChatMessage, ChatResult, Provider } from "@core/llm/types"
import { buildTool } from "@core/tools/Tool"
import { ToolRegistry } from "@core/tools/registry"
import type { SuccessSpec } from "@core/verify/types"
import { makeVerifier } from "@core/verify/verifier"
import { z } from "zod/v4"

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "qc-verifier-"))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function makeJob(spec: SuccessSpec | undefined, over: Partial<Job> = {}): Job {
  return {
    id: "j",
    projectHash: "h",
    cwd: dir,
    goal: "Produce a valuation report",
    status: "running",
    successSpec: spec,
    maxTurns: 10,
    turnsUsed: 1,
    readOnly: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

function turn(text: string, toolOutputs: unknown[] = []): JobTurn {
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: toolOutputs.map((output, i) => ({
        type: "tool_result" as const,
        toolUseId: `t${i}`,
        output,
        isError: false,
      })),
    },
    { role: "assistant", content: text },
  ]
  return { seq: 0, messages, text, inputTokens: 1, outputTokens: 1, ts: 0 }
}

/** Judge that answers every aspect with the same scripted boolean word. */
function judgeAll(word: "yes" | "no"): Provider {
  return {
    id: "fake-judge",
    async chat(): Promise<ChatResult> {
      return { text: word, inputTokens: 0, outputTokens: 0, stopReason: "end_turn" }
    },
  }
}

describe("makeVerifier", () => {
  test("spec-less job → done (single-pass, no loop)", async () => {
    const verify = makeVerifier({})
    const v = await verify(makeJob(undefined), [turn("anything")])
    expect(v.kind).toBe("done")
    expect(v.reason).toContain("no success criteria")
  })

  test("empty-criteria spec → done", async () => {
    const verify = makeVerifier({})
    const v = await verify(makeJob({ criteria: [] }), [turn("anything")])
    expect(v.kind).toBe("done")
  })

  test("failing artifact criterion → continue with continuation text", async () => {
    const spec: SuccessSpec = { criteria: [{ kind: "artifactExists", path: "missing-output.md" }] }
    const verify = makeVerifier({})
    const v = await verify(makeJob(spec), [turn("I think I'm done")])
    expect(v.kind).toBe("continue")
    expect(v.continuation).toBeDefined()
    expect(v.continuation).toContain("Not done yet")
  })

  test("all deterministic pass + no fuzzy → done", async () => {
    writeFileSync(join(dir, "ok-report.md"), "content")
    writeFileSync(join(dir, "metrics.json"), JSON.stringify({ valuation: { pe: 18.5 } }))
    const spec: SuccessSpec = {
      criteria: [
        { kind: "artifactExists", path: "ok-report.md" },
        { kind: "numericInRange", path: "metrics.json", pointer: "valuation.pe", min: 5, max: 40 },
      ],
    }
    const verify = makeVerifier({})
    const v = await verify(makeJob(spec), [turn("done")])
    expect(v.kind).toBe("done")
    expect(v.reason).toContain("deterministic")
  })

  test("groundedValue conflict → needs-human", async () => {
    writeFileSync(join(dir, "conflict.json"), JSON.stringify({ valuation: { pe: 18.5 } }))
    const registry = new ToolRegistry()
    registry.register(
      buildTool({
        name: "quote",
        description: "fake",
        inputSchema: z.object({ ticker: z.string() }),
        isReadOnly: () => true,
        async call() {
          return { output: { valuation: { pe: 99 } } } // disagrees hard
        },
      }),
    )
    const spec: SuccessSpec = {
      criteria: [
        {
          kind: "groundedValue",
          path: "conflict.json",
          pointer: "valuation.pe",
          tool: "quote",
          input: { ticker: "AAPL" },
          tolerancePct: 5,
        },
      ],
    }
    const verify = makeVerifier({ registry })
    const v = await verify(makeJob(spec), [turn("done")])
    expect(v.kind).toBe("needs-human")
  })

  test("fuzzy aspects + judge meeting threshold → done", async () => {
    writeFileSync(join(dir, "fuzzy-ok.md"), "content")
    const spec: SuccessSpec = {
      criteria: [{ kind: "artifactExists", path: "fuzzy-ok.md" }],
      fuzzyAspects: ["is well written", "cites sources"],
      passThreshold: 0.5,
    }
    const verify = makeVerifier({ judge: judgeAll("yes") })
    const v = await verify(makeJob(spec), [turn("a great report")])
    expect(v.kind).toBe("done")
  })

  test("fuzzy aspects + judge below threshold → continue", async () => {
    writeFileSync(join(dir, "fuzzy-bad.md"), "content")
    const spec: SuccessSpec = {
      criteria: [{ kind: "artifactExists", path: "fuzzy-bad.md" }],
      fuzzyAspects: ["is well written", "cites sources"],
      passThreshold: 0.67,
    }
    const verify = makeVerifier({ judge: judgeAll("no") })
    const v = await verify(makeJob(spec), [turn("a weak report")])
    expect(v.kind).toBe("continue")
    expect(v.reason).toContain("fuzzy")
  })

  test("fuzzy aspects but no judge provider → done (fuzzy skipped)", async () => {
    writeFileSync(join(dir, "fuzzy-skip.md"), "content")
    const spec: SuccessSpec = {
      criteria: [{ kind: "artifactExists", path: "fuzzy-skip.md" }],
      fuzzyAspects: ["is well written"],
    }
    const verify = makeVerifier({})
    const v = await verify(makeJob(spec), [turn("report")])
    expect(v.kind).toBe("done")
    expect(v.reason?.toLowerCase()).toContain("skip")
  })
})
