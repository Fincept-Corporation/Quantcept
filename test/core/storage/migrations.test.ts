import { describe, expect, it, beforeAll } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

beforeAll(() => {
  process.env.QUANTCEPT_CONFIG_DIR = mkdtempSync(join(tmpdir(), "qc-mig-"))
})

describe("jobs_v1 migration", () => {
  it("creates job, job_turn, budget_ledger tables", async () => {
    const { openDb } = await import("@core/storage/db")
    const db = openDb()
    const names = (db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
      (r) => r.name,
    )
    expect(names).toContain("job")
    expect(names).toContain("job_turn")
    expect(names).toContain("budget_ledger")
    db.close()
  })
})

describe("jobs_v2_budget migration", () => {
  it("adds a budget column to the job table", async () => {
    const { openDb } = await import("@core/storage/db")
    const db = openDb()
    const cols = (db.query("PRAGMA table_info(job)").all() as { name: string }[]).map((r) => r.name)
    expect(cols).toContain("budget")
    db.close()
  })
})

describe("risk_v1 migration", () => {
  it("creates account, position, reservation, order_outbox, pending_approval tables", async () => {
    const { openDb } = await import("@core/storage/db")
    const db = openDb()
    const names = (db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
      (r) => r.name,
    )
    expect(names).toContain("account")
    expect(names).toContain("position")
    expect(names).toContain("reservation")
    expect(names).toContain("order_outbox")
    expect(names).toContain("pending_approval")
    db.close()
  })
})
