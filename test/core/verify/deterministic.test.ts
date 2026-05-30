import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Job, JobTurn } from "@core/jobs/types"
import type { ChatMessage } from "@core/llm/types"
import { artifactExists, citationsGrounded, numericInRange } from "@core/verify/deterministic"
import type { Criterion } from "@core/verify/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "qc-verify-det-"))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: "j",
    projectHash: "h",
    cwd: dir,
    goal: "g",
    status: "running",
    maxTurns: 10,
    turnsUsed: 1,
    readOnly: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

/** Build a single JobTurn whose messages carry a tool_result with the given output. */
function turnWith(text: string, toolOutputs: unknown[]): JobTurn {
  const messages: ChatMessage[] = [
    { role: "user", content: "do it" },
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

// ---------------------------------------------------------------------------
// artifactExists
// ---------------------------------------------------------------------------

describe("artifactExists", () => {
  test("hit: file present under cwd → ok", () => {
    writeFileSync(join(dir, "report.md"), "hello")
    const c: Criterion = { kind: "artifactExists", path: "report.md" }
    const r = artifactExists(makeJob(), c)
    expect(r.ok).toBe(true)
  })

  test("miss: file absent → not ok", () => {
    const c: Criterion = { kind: "artifactExists", path: "nope.md" }
    const r = artifactExists(makeJob(), c)
    expect(r.ok).toBe(false)
    expect(r.detail).toContain("nope.md")
  })
})

// ---------------------------------------------------------------------------
// numericInRange
// ---------------------------------------------------------------------------

describe("numericInRange", () => {
  beforeAll(() => {
    writeFileSync(join(dir, "val.json"), JSON.stringify({ valuation: { pe: 18.5 }, name: "AAPL" }))
  })

  test("in range → ok", () => {
    const c: Criterion = { kind: "numericInRange", path: "val.json", pointer: "valuation.pe", min: 10, max: 30 }
    const r = numericInRange(makeJob(), c)
    expect(r.ok).toBe(true)
  })

  test("out of range → not ok", () => {
    const c: Criterion = { kind: "numericInRange", path: "val.json", pointer: "valuation.pe", min: 20, max: 30 }
    const r = numericInRange(makeJob(), c)
    expect(r.ok).toBe(false)
  })

  test("missing pointer → not ok", () => {
    const c: Criterion = { kind: "numericInRange", path: "val.json", pointer: "valuation.ev", min: 0, max: 1e9 }
    const r = numericInRange(makeJob(), c)
    expect(r.ok).toBe(false)
  })

  test("non-number value → not ok", () => {
    const c: Criterion = { kind: "numericInRange", path: "val.json", pointer: "name", min: 0, max: 1e9 }
    const r = numericInRange(makeJob(), c)
    expect(r.ok).toBe(false)
  })

  test("missing file → not ok", () => {
    const c: Criterion = { kind: "numericInRange", path: "ghost.json", pointer: "a.b", min: 0, max: 1 }
    const r = numericInRange(makeJob(), c)
    expect(r.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// citationsGrounded
// ---------------------------------------------------------------------------

describe("citationsGrounded", () => {
  test("number present in a tool_result output → grounded", () => {
    const turn = turnWith("Revenue was 383.29 billion this year.", [{ revenue: 383.29 }])
    const r = citationsGrounded([turn])
    expect(r.ok).toBe(true)
    expect(r.ungrounded).toEqual([])
  })

  test("fabricated number not in any tool output → ungrounded", () => {
    const turn = turnWith("Revenue was 999.99 billion.", [{ revenue: 383.29 }])
    const r = citationsGrounded([turn])
    expect(r.ok).toBe(false)
    expect(r.ungrounded).toContain("999.99")
  })

  test("ignores trivial small integers and years even if absent from tool output", () => {
    // 3 (small int) and 2024 (year) must NOT count as ungrounded.
    const turn = turnWith("In 2024 the top 3 names led; margin was 42.1%.", [{ margin: 42.1 }])
    const r = citationsGrounded([turn])
    expect(r.ok).toBe(true)
    expect(r.ungrounded).toEqual([])
  })

  test("grounding tolerates thousands separators in the final text", () => {
    const turn = turnWith("Net income reached 96,995 million.", [{ netIncome: 96995 }])
    const r = citationsGrounded([turn])
    expect(r.ok).toBe(true)
  })

  test("detail lists the ungrounded numbers", () => {
    const turn = turnWith("EPS of 6.13 and a wild 12345.67.", [{ eps: 6.13 }])
    const r = citationsGrounded([turn])
    expect(r.ok).toBe(false)
    expect(r.detail).toContain("12345.67")
  })
})
