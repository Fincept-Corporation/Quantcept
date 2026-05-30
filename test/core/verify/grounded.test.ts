import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Job } from "@core/jobs/types"
import { buildTool } from "@core/tools/Tool"
import { ToolRegistry } from "@core/tools/registry"
import { groundedValue } from "@core/verify/grounded"
import type { Criterion } from "@core/verify/types"
import { z } from "zod/v4"

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "qc-verify-grnd-"))
  // Artifact under test: claims pe = 18.5
  writeFileSync(join(dir, "val.json"), JSON.stringify({ valuation: { pe: 18.5 } }))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function makeJob(): Job {
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
  }
}

/** A registry whose `quote` tool returns a structured object with a `valuation.pe` field. */
function registryReturning(pe: number): ToolRegistry {
  const reg = new ToolRegistry()
  reg.register(
    buildTool({
      name: "quote",
      description: "fake quote",
      inputSchema: z.object({ ticker: z.string() }),
      isReadOnly: () => true,
      async call() {
        return { output: { valuation: { pe } } }
      },
    }),
  )
  return reg
}

describe("groundedValue", () => {
  test("within tolerance → ok", async () => {
    const c: Criterion = {
      kind: "groundedValue",
      path: "val.json",
      pointer: "valuation.pe",
      tool: "quote",
      input: { ticker: "AAPL" },
      tolerancePct: 5,
    }
    // tool says 18.6 vs artifact 18.5 → ~0.54% diff, within 5%
    const r = await groundedValue(makeJob(), c, registryReturning(18.6))
    expect(r.ok).toBe(true)
  })

  test("beyond tolerance → not ok (conflict)", async () => {
    const c: Criterion = {
      kind: "groundedValue",
      path: "val.json",
      pointer: "valuation.pe",
      tool: "quote",
      input: { ticker: "AAPL" },
      tolerancePct: 5,
    }
    // tool says 30 vs artifact 18.5 → far beyond 5%
    const r = await groundedValue(makeJob(), c, registryReturning(30))
    expect(r.ok).toBe(false)
    expect(r.detail.toLowerCase()).toContain("18.5")
  })

  test("missing tool → not ok", async () => {
    const c: Criterion = {
      kind: "groundedValue",
      path: "val.json",
      pointer: "valuation.pe",
      tool: "does-not-exist",
      input: { ticker: "AAPL" },
      tolerancePct: 5,
    }
    const r = await groundedValue(makeJob(), c, new ToolRegistry())
    expect(r.ok).toBe(false)
    expect(r.detail.toLowerCase()).toContain("not available")
  })

  test("missing artifact value → not ok", async () => {
    const c: Criterion = {
      kind: "groundedValue",
      path: "ghost.json",
      pointer: "valuation.pe",
      tool: "quote",
      input: { ticker: "AAPL" },
      tolerancePct: 5,
    }
    const r = await groundedValue(makeJob(), c, registryReturning(18.5))
    expect(r.ok).toBe(false)
  })
})
