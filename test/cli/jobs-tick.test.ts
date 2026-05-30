import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { JobStore } from "@core/jobs/store"
import type { Job } from "@core/jobs/types"
import type { Schedule } from "@core/schedule"
import { projectHash } from "@core/storage/paths"
import { runJobsCli, tickDueJobs } from "@cli/jobs-command"

let tmp: string
let store: JobStore
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-jobs-tick-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
  store = new JobStore()
})
afterEach(() => {
  store.close()
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

const INTERVAL: Schedule = { kind: "interval", everyMinutes: 60 }

describe("tickDueJobs", () => {
  test("a due scheduled job runs and its next_run_at advances to the future", async () => {
    const job = store.create({ id: "due1", cwd: "/repo/a", goal: "snapshot", schedule: INTERVAL })
    const now = Date.now()
    // scheduled slightly in the past, well within the staleness window
    store.setNextRun("due1", now - 30_000)

    const ran: string[] = []
    const res = await tickDueJobs({
      store,
      projectHash: job.projectHash,
      run: async (j) => {
        ran.push(j.id)
      },
      now,
      maxStalenessSeconds: 3600,
    })

    expect(res.ran).toContain("due1")
    expect(res.skipped).not.toContain("due1")
    expect(ran).toEqual(["due1"])
    // next_run_at advanced strictly into the future
    const after = store.get("due1")!
    expect(after.nextRunAt).toBeDefined()
    expect(after.nextRunAt!).toBeGreaterThan(now)
    // last_run_at recorded
    expect(after.lastRunAt).toBe(now)
  })

  test("a stale scheduled job is NOT run, is skipped, logs, and advances past the stale slot", async () => {
    const job = store.create({ id: "stale1", cwd: "/repo/a", goal: "snapshot", schedule: INTERVAL })
    const now = Date.now()
    // scheduled far in the past — well beyond maxStalenessSeconds
    const staleAt = now - 7200_000 // 2h ago
    store.setNextRun("stale1", staleAt)

    const ran: string[] = []
    const logs: string[] = []
    const res = await tickDueJobs({
      store,
      projectHash: job.projectHash,
      run: async (j) => {
        ran.push(j.id)
      },
      now,
      maxStalenessSeconds: 3600, // 1h grace
      log: (m) => logs.push(m),
    })

    expect(res.skipped).toContain("stale1")
    expect(res.ran).not.toContain("stale1")
    expect(ran).toEqual([]) // run was never called
    expect(logs.some((l) => l.includes("stale1") && l.includes("stale"))).toBe(true)
    // advanced to a future slot (past the stale one)
    const after = store.get("stale1")!
    expect(after.nextRunAt).toBeDefined()
    expect(after.nextRunAt!).toBeGreaterThan(now)
    expect(after.nextRunAt!).toBeGreaterThan(staleAt)
    // last_run_at NOT set (it never ran)
    expect(after.lastRunAt).toBeUndefined()
  })

  test("a job with no schedule and null next_run_at runs (claimDue includes it)", async () => {
    const job = store.create({ id: "nosched", cwd: "/repo/a", goal: "one-shot" })
    const now = Date.now()

    const ran: string[] = []
    const res = await tickDueJobs({
      store,
      projectHash: job.projectHash,
      run: async (j) => {
        ran.push(j.id)
      },
      now,
      maxStalenessSeconds: 3600,
    })

    expect(res.ran).toContain("nosched")
    expect(ran).toEqual(["nosched"])
    // last_run set; no schedule → next_run stays null
    const after = store.get("nosched")!
    expect(after.lastRunAt).toBe(now)
    expect(after.nextRunAt).toBeUndefined()
  })

  test("a completed job is not run by tick", async () => {
    const job = store.create({ id: "done1", cwd: "/repo/a", goal: "x" })
    store.complete("done1")
    const now = Date.now()

    const ran: string[] = []
    const res = await tickDueJobs({
      store,
      projectHash: job.projectHash,
      run: async (j) => {
        ran.push(j.id)
      },
      now,
      maxStalenessSeconds: 3600,
    })

    expect(res.ran).not.toContain("done1")
    expect(res.skipped).not.toContain("done1")
    expect(ran).toEqual([])
  })

  test("summary lists ran and skipped together across a mixed batch", async () => {
    const job = store.create({ id: "freshA", cwd: "/repo/a", goal: "a", schedule: INTERVAL })
    store.create({ id: "staleB", cwd: "/repo/a", goal: "b", schedule: INTERVAL })
    const now = Date.now()
    store.setNextRun("freshA", now - 1_000) // fresh
    store.setNextRun("staleB", now - 7200_000) // stale

    const ran: string[] = []
    const res = await tickDueJobs({
      store,
      projectHash: job.projectHash,
      run: async (j) => {
        ran.push(j.id)
      },
      now,
      maxStalenessSeconds: 3600,
    })

    expect(res.ran).toContain("freshA")
    expect(res.skipped).toContain("staleB")
    expect(ran).toEqual(["freshA"])
  })
})

describe("JobStore.resume", () => {
  test("resume makes a paused job pending and claimable again, clearing pause_reason", () => {
    store.create({ id: "p1", cwd: "/repo/a", goal: "x" })
    store.pause("p1", "needs-human")
    expect(store.get("p1")!.status).toBe("paused")
    expect(store.get("p1")!.pauseReason).toBe("needs-human")

    const resumed = store.resume("p1")
    expect(resumed.status).toBe("pending")
    expect(resumed.pauseReason).toBeUndefined()
    expect(store.get("p1")!.status).toBe("pending")
    expect(store.get("p1")!.pauseReason).toBeUndefined()
  })
})

describe("runJobsCli smoke (no LLM)", () => {
  // Capture console.log so the table/usage output does not pollute test output.
  let logs: string[]
  const orig = console.log
  beforeEach(() => {
    logs = []
    console.log = (...a: unknown[]) => {
      logs.push(a.map(String).join(" "))
    }
  })
  afterEach(() => {
    console.log = orig
  })

  test("add then list does not throw and the new job shows up", async () => {
    await runJobsCli("add", ["analyze", "AAPL"])
    // an id was printed
    expect(logs.join("\n")).toMatch(/[0-9a-f]{8}/)

    await runJobsCli("list", [])
    const out = logs.join("\n")
    // the goal should appear in the listing
    expect(out).toContain("analyze AAPL")
  })

  test("unknown action prints usage without throwing", async () => {
    await runJobsCli("frobnicate", [])
    expect(logs.join("\n").toLowerCase()).toContain("usage")
  })

  test("install prints the OS-scheduler commands for both Windows and cron", async () => {
    await runJobsCli("install", [])
    const out = logs.join("\n")
    expect(out).toContain("schtasks")
    expect(out).toContain("* * * * *")
  })

  test("add with --once schedule sets a future next_run", async () => {
    await runJobsCli("add", ["snapshot", "MSFT", "--schedule", JSON.stringify(INTERVAL)])
    const idLine = logs.find((l) => /[0-9a-f]{8}/.test(l))
    expect(idLine).toBeDefined()
    const id = idLine!.match(/[0-9a-f]{8}/)![0]
    const job = store.get(id) as Job | undefined
    expect(job).toBeDefined()
    expect(job!.nextRunAt).toBeDefined()
    expect(job!.nextRunAt!).toBeGreaterThan(Date.now())
  })

  // Regression guard for the yargs wiring: with `unknown-options-as-args`, flags arrive
  // interleaved among the positionals in `rest` (e.g. ["analyze","AAPL","--max-turns","7", ...]).
  // The delegate must parse them itself — they must take effect, not be ignored.
  test("flags interleaved in rest (as yargs delivers them) all take effect", async () => {
    await runJobsCli("add", ["analyze", "AAPL", "--max-turns", "7", "--once", "--read-only=false"])
    const id = logs.find((l) => /[0-9a-f]{8}/.test(l))!.match(/[0-9a-f]{8}/)![0]
    const job = store.get(id)!
    expect(job.goal).toBe("analyze AAPL") // flags stripped from the goal
    expect(job.maxTurns).toBe(7) // --max-turns honored
    expect(job.readOnly).toBe(false) // --read-only=false honored
    expect(job.nextRunAt).toBeDefined() // --once set a schedule → next_run
  })
})
