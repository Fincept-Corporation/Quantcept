import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { JobStore } from "@core/jobs/store"
import type { ChatMessage } from "@core/llm/types"

let tmp: string
let store: JobStore
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-jobs-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
  store = new JobStore()
})
afterEach(() => {
  store.close()
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("JobStore", () => {
  test("create + get + listByProject: status is pending, goal round-trips", () => {
    const job = store.create({ id: "j1", cwd: "/repo/a", goal: "Summarize AAPL earnings" })
    expect(job.id).toBe("j1")
    expect(job.status).toBe("pending")
    expect(job.goal).toBe("Summarize AAPL earnings")
    expect(job.turnsUsed).toBe(0)
    expect(job.readOnly).toBe(true)

    const fetched = store.get("j1")
    expect(fetched).toBeDefined()
    expect(fetched!.goal).toBe("Summarize AAPL earnings")
    expect(fetched!.status).toBe("pending")

    const list = store.listByProject(job.projectHash)
    expect(list.length).toBe(1)
    expect(list[0]!.id).toBe("j1")
  })

  test("create respects maxTurns and readOnly overrides", () => {
    const job = store.create({ id: "j2", cwd: "/repo/a", goal: "Buy MSFT", maxTurns: 5, readOnly: false })
    expect(job.maxTurns).toBe(5)
    expect(job.readOnly).toBe(false)
    const fetched = store.get("j2")!
    expect(fetched.maxTurns).toBe(5)
    expect(fetched.readOnly).toBe(false)
  })

  test("budget round-trips through create/get; absent budget is undefined", () => {
    store.create({ id: "jb", cwd: "/repo/a", goal: "Budgeted task", budget: { maxUsd: 5 } })
    expect(store.get("jb")!.budget).toEqual({ maxUsd: 5 })

    store.create({ id: "jn", cwd: "/repo/a", goal: "No budget" })
    expect(store.get("jn")!.budget).toBeUndefined()
  })

  test("appendTurn then loadTurns returns the turn with messages intact; turnsUsed incremented", () => {
    store.create({ id: "j1", cwd: "/repo/a", goal: "test" })
    const messages: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]
    store.appendTurn("j1", {
      seq: 0,
      messages,
      text: "Hi there",
      model: "claude-3-5-sonnet",
      inputTokens: 10,
      outputTokens: 5,
      ts: Date.now(),
    })

    const turns = store.loadTurns("j1")
    expect(turns.length).toBe(1)
    expect(turns[0]!.seq).toBe(0)
    expect(turns[0]!.messages).toEqual(messages)
    expect(turns[0]!.text).toBe("Hi there")
    expect(turns[0]!.inputTokens).toBe(10)
    expect(turns[0]!.outputTokens).toBe(5)

    const job = store.get("j1")!
    expect(job.turnsUsed).toBe(1)
  })

  test("appendTurn accumulates multiple turns and turnsUsed increments correctly", () => {
    store.create({ id: "j1", cwd: "/repo/a", goal: "test" })
    store.appendTurn("j1", { seq: 0, messages: [], text: "t1", inputTokens: 1, outputTokens: 1, ts: 1 })
    store.appendTurn("j1", { seq: 1, messages: [], text: "t2", inputTokens: 2, outputTokens: 2, ts: 2 })

    const turns = store.loadTurns("j1")
    expect(turns.length).toBe(2)
    expect(store.get("j1")!.turnsUsed).toBe(2)
  })

  test("markRunning/pause/complete transitions reflected by get()", () => {
    store.create({ id: "j1", cwd: "/repo/a", goal: "test" })

    const running = store.markRunning("j1")
    expect(running.status).toBe("running")
    expect(store.get("j1")!.status).toBe("running")

    const paused = store.pause("j1", "budget")
    expect(paused.status).toBe("paused")
    expect(paused.pauseReason).toBe("budget")
    expect(store.get("j1")!.pauseReason).toBe("budget")

    const done = store.complete("j1")
    expect(done.status).toBe("done")
    // pause_reason should be cleared on completion
    expect(store.get("j1")!.pauseReason).toBeUndefined()
  })

  test("fail() sets status to failed", () => {
    store.create({ id: "j1", cwd: "/repo/a", goal: "test" })
    const failed = store.fail("j1")
    expect(failed.status).toBe("failed")
    expect(store.get("j1")!.status).toBe("failed")
  })

  test("claimDue: job with null next_run_at IS returned", () => {
    store.create({ id: "j1", cwd: "/repo/a", goal: "test" })
    const job = store.get("j1")!
    const due = store.claimDue(job.projectHash, Date.now())
    expect(due.map((j) => j.id)).toContain("j1")
  })

  test("claimDue: job with next_run_at in the past IS returned", () => {
    const job = store.create({ id: "j1", cwd: "/repo/a", goal: "test" })
    store.setNextRun("j1", Date.now() - 10_000)
    const due = store.claimDue(job.projectHash, Date.now())
    expect(due.map((j) => j.id)).toContain("j1")
  })

  test("claimDue: after complete() job is NOT returned", () => {
    const job = store.create({ id: "j1", cwd: "/repo/a", goal: "test" })
    store.complete("j1")
    const due = store.claimDue(job.projectHash, Date.now())
    expect(due.map((j) => j.id)).not.toContain("j1")
  })

  test("claimDue: job with next_run_at in the future is NOT returned", () => {
    const job = store.create({ id: "j1", cwd: "/repo/a", goal: "test" })
    store.setNextRun("j1", Date.now() + 999_999)
    const due = store.claimDue(job.projectHash, Date.now())
    expect(due.map((j) => j.id)).not.toContain("j1")
  })

  test("loadTurns on unknown id returns empty array", () => {
    const turns = store.loadTurns("never-created")
    expect(turns).toEqual([])
  })

  test("listByProject orders by updated_at DESC", () => {
    store.create({ id: "j1", cwd: "/repo/a", goal: "first" })
    // small delay to ensure different timestamps
    const t1 = Date.now()
    store.create({ id: "j2", cwd: "/repo/a", goal: "second" })
    // touch j1 to make it newest
    store.markRunning("j1")
    store.complete("j1")

    const list = store.listByProject(store.get("j1")!.projectHash)
    expect(list[0]!.id).toBe("j1")
  })

  test("setLastRun persists the timestamp", () => {
    store.create({ id: "j1", cwd: "/repo/a", goal: "test" })
    const ts = Date.now()
    store.setLastRun("j1", ts)
    expect(store.get("j1")!.lastRunAt).toBe(ts)
  })

  test("delete removes the job (and not its siblings)", () => {
    store.create({ id: "j1", cwd: "/repo/a", goal: "first" })
    store.create({ id: "j2", cwd: "/repo/a", goal: "second" })
    const ph = store.get("j1")!.projectHash
    store.delete("j1")
    expect(store.get("j1")).toBeUndefined()
    expect(store.listByProject(ph).map((j) => j.id)).toEqual(["j2"])
  })
})
