import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PendingApprovalStore } from "@core/risk/approvals"
import { runJobsCli } from "@cli/jobs-command"

// Hermetic: a temp config dir → the shared SQLite DB (jobs + approvals) lives in throwaway storage.
let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-jobs-approvals-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("runJobsCli approvals / approve / deny (no LLM)", () => {
  // Capture console.log so verb output does not pollute the test stream.
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

  test("approvals lists a pending row enqueued directly via the store", async () => {
    const store = new PendingApprovalStore()
    const id = store.enqueue({ jobId: "job-1", action: "place_order", payload: { symbol: "AAPL", side: "buy", qty: 3 } })
    store.close()

    await runJobsCli("approvals", [])
    const out = logs.join("\n")
    expect(out).toContain(id)
    expect(out).toContain("place_order")
    expect(out).toContain("job-1")
  })

  test("approve <id> resolves the row to approved (out of pending)", async () => {
    const store = new PendingApprovalStore()
    const id = store.enqueue({ jobId: "job-2", action: "place_order", payload: { symbol: "MSFT", qty: 5 } })
    store.close()

    await runJobsCli("approve", [id])
    expect(logs.join("\n").toLowerCase()).toContain("approv")

    // Verify via a fresh store over the same DB.
    const check = new PendingApprovalStore()
    try {
      expect(check.get(id)?.status).toBe("approved")
      expect(check.list("pending").find((p) => p.id === id)).toBeUndefined()
    } finally {
      check.close()
    }
  })

  test("deny <id> resolves the row to denied", async () => {
    const store = new PendingApprovalStore()
    const id = store.enqueue({ jobId: "job-3", action: "place_order", payload: { symbol: "TSLA", qty: 1 } })
    store.close()

    await runJobsCli("deny", [id])
    expect(logs.join("\n").toLowerCase()).toContain("deni")

    const check = new PendingApprovalStore()
    try {
      expect(check.get(id)?.status).toBe("denied")
    } finally {
      check.close()
    }
  })

  test("approvals with nothing pending prints a friendly empty message (no throw)", async () => {
    await runJobsCli("approvals", [])
    // Should not throw and should print something (an empty-state line).
    expect(logs.length).toBeGreaterThanOrEqual(1)
  })

  test("approve with no id prints usage without throwing", async () => {
    await runJobsCli("approve", [])
    expect(logs.join("\n").toLowerCase()).toContain("usage")
  })
})
