import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BudgetGovernor } from "@core/budget/governor"

let tmp: string
// Track open governors to close them before rmSync to avoid Windows EBUSY
const openGovs: BudgetGovernor[] = []

function makeGov(budget: ConstructorParameters<typeof BudgetGovernor>[0]["budget"], pricing?: ConstructorParameters<typeof BudgetGovernor>[0]["pricing"]): BudgetGovernor {
  const g = new BudgetGovernor({ budget, pricing })
  openGovs.push(g)
  return g
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-budget-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})

afterEach(() => {
  while (openGovs.length) openGovs.pop()!.close()
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("BudgetGovernor.recordTurn + spend", () => {
  test("accumulates input/output tokens and usd", () => {
    const gov = makeGov({})
    gov.recordTurn("j1", { inputTokens: 1_000_000, outputTokens: 500_000 }, "MiniMax-M2.7")
    const s = gov.spend("j1")
    expect(s.inputTokens).toBe(1_000_000)
    expect(s.outputTokens).toBe(500_000)
    // 1M * 0.3 + 0.5M * 1.2 = 0.3 + 0.6 = 0.9
    expect(s.usd).toBeCloseTo(0.9, 10)
    expect(s.toolCalls).toBe(0)
    expect(s.dataCalls).toBe(0)
  })

  test("accumulates across multiple recordTurn calls", () => {
    const gov = makeGov({})
    gov.recordTurn("j1", { inputTokens: 100, outputTokens: 50 }, "MiniMax-M2.7")
    gov.recordTurn("j1", { inputTokens: 200, outputTokens: 100 }, "MiniMax-M2.7")
    const s = gov.spend("j1")
    expect(s.inputTokens).toBe(300)
    expect(s.outputTokens).toBe(150)
  })

  test("spend returns zeros for unseen job", () => {
    const gov = makeGov({})
    const s = gov.spend("never-seen")
    expect(s).toEqual({ inputTokens: 0, outputTokens: 0, usd: 0, toolCalls: 0, dataCalls: 0 })
  })
})

describe("BudgetGovernor persistence across instances", () => {
  test("second instance reads spend recorded by first (across-turn persistence)", () => {
    const gov1 = makeGov({})
    gov1.recordTurn("j1", { inputTokens: 5_000, outputTokens: 2_000 }, "MiniMax-M2.7")

    // Intentionally create a fresh instance — simulates a new process or new call
    const gov2 = makeGov({})
    const s = gov2.spend("j1")
    expect(s.inputTokens).toBe(5_000)
    expect(s.outputTokens).toBe(2_000)
  })
})

describe("BudgetGovernor.check — token ceiling", () => {
  test("returns {ok:true} when tokens below maxTokens", () => {
    const gov = makeGov({ maxTokens: 10_000 })
    gov.recordTurn("j1", { inputTokens: 3_000, outputTokens: 2_000 })
    expect(gov.check("j1")).toEqual({ ok: true })
  })

  test("returns {ok:false, exceeded:'maxTokens'} when tokens >= maxTokens", () => {
    const gov = makeGov({ maxTokens: 5_000 })
    gov.recordTurn("j1", { inputTokens: 3_000, outputTokens: 2_000 })
    // 3000 + 2000 = 5000 >= 5000
    expect(gov.check("j1")).toEqual({ ok: false, exceeded: "maxTokens" })
  })

  test("returns exceeded:'maxTokens' when over the limit", () => {
    const gov = makeGov({ maxTokens: 4_000 })
    gov.recordTurn("j1", { inputTokens: 3_000, outputTokens: 2_000 })
    // 5000 > 4000
    expect(gov.check("j1")).toEqual({ ok: false, exceeded: "maxTokens" })
  })
})

describe("BudgetGovernor.check — USD ceiling", () => {
  test("returns {ok:false, exceeded:'maxUsd'} when usd >= maxUsd", () => {
    // 1M input @ 0.3 + 1M output @ 1.2 = $1.50 for MiniMax-M2.7
    const gov = makeGov({ maxUsd: 1.5 })
    gov.recordTurn("j1", { inputTokens: 1_000_000, outputTokens: 1_000_000 }, "MiniMax-M2.7")
    expect(gov.check("j1")).toEqual({ ok: false, exceeded: "maxUsd" })
  })

  test("returns {ok:true} when usd < maxUsd", () => {
    const gov = makeGov({ maxUsd: 2.0 })
    gov.recordTurn("j1", { inputTokens: 1_000_000, outputTokens: 1_000_000 }, "MiniMax-M2.7")
    // $1.50 < $2.00
    expect(gov.check("j1")).toEqual({ ok: true })
  })
})

describe("BudgetGovernor.recordToolCall + check toolCalls/dataCalls", () => {
  test("recordToolCall increments toolCalls", () => {
    const gov = makeGov({})
    gov.recordToolCall("j1", false)
    gov.recordToolCall("j1", false)
    const s = gov.spend("j1")
    expect(s.toolCalls).toBe(2)
    expect(s.dataCalls).toBe(0)
  })

  test("recordToolCall with isData=true increments both toolCalls and dataCalls", () => {
    const gov = makeGov({})
    gov.recordToolCall("j1", true)
    const s = gov.spend("j1")
    expect(s.toolCalls).toBe(1)
    expect(s.dataCalls).toBe(1)
  })

  test("check flips at maxToolCalls", () => {
    const gov = makeGov({ maxToolCalls: 3 })
    gov.recordToolCall("j1", false)
    gov.recordToolCall("j1", false)
    expect(gov.check("j1")).toEqual({ ok: true })
    gov.recordToolCall("j1", false)
    // 3 >= 3
    expect(gov.check("j1")).toEqual({ ok: false, exceeded: "maxToolCalls" })
  })

  test("check flips at maxDataCalls", () => {
    const gov = makeGov({ maxDataCalls: 2 })
    gov.recordToolCall("j1", true)
    expect(gov.check("j1")).toEqual({ ok: true })
    gov.recordToolCall("j1", true)
    // 2 >= 2
    expect(gov.check("j1")).toEqual({ ok: false, exceeded: "maxDataCalls" })
  })
})

describe("BudgetGovernor.executorHook", () => {
  test("hook check returns ok:true before budget exhausted", () => {
    const gov = makeGov({ maxToolCalls: 5 })
    const hook = gov.executorHook("j1")
    expect(hook.check()).toEqual({ ok: true })
  })

  test("hook check returns ok:false after budget exhausted", () => {
    const gov = makeGov({ maxToolCalls: 1 })
    gov.recordToolCall("j1", false)
    const hook = gov.executorHook("j1")
    expect(hook.check()).toEqual({ ok: false })
  })

  test("hook recordToolCall increments spend", () => {
    const gov = makeGov({})
    const hook = gov.executorHook("j1")
    hook.recordToolCall(true)
    hook.recordToolCall(false)
    const s = gov.spend("j1")
    expect(s.toolCalls).toBe(2)
    expect(s.dataCalls).toBe(1)
  })
})

describe("BudgetGovernor day ledger", () => {
  test("recordTurn also writes to day:<date> scope (not enforced, just recorded)", () => {
    const gov = makeGov({})
    gov.recordTurn("j1", { inputTokens: 1000, outputTokens: 500 }, "MiniMax-M2.7")
    // Access the DB directly to verify the day row was written
    // @ts-expect-error accessing private
    const db = gov["db"]
    const dayPattern = new Date().toISOString().slice(0, 10)
    const row = db
      .query("SELECT input_tokens, output_tokens FROM budget_ledger WHERE scope LIKE ?")
      .get(`day:${dayPattern}`) as { input_tokens: number; output_tokens: number } | null
    expect(row).not.toBeNull()
    expect(row!.input_tokens).toBe(1000)
    expect(row!.output_tokens).toBe(500)
  })
})
