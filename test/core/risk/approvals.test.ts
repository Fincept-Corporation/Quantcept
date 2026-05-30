import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PendingApprovalStore } from "@core/risk/approvals"

// Hermetic: a temp config dir so the real DB file lives in throwaway storage.
let tmp: string
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-approvals-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterAll(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("PendingApprovalStore — enqueue / list / get", () => {
  test("enqueue returns an id and the row shows up in list('pending')", () => {
    const s = new PendingApprovalStore()
    try {
      const id = s.enqueue({ jobId: "j1", action: "place_order", payload: { symbol: "AAPL", qty: 10 } })
      expect(typeof id).toBe("string")
      expect(id.length).toBeGreaterThan(0)

      const pending = s.list("pending")
      const row = pending.find((p) => p.id === id)
      expect(row).toBeDefined()
      expect(row?.jobId).toBe("j1")
      expect(row?.action).toBe("place_order")
      expect(row?.status).toBe("pending")
      expect(row?.payload).toEqual({ symbol: "AAPL", qty: 10 })
      expect(typeof row?.createdAt).toBe("number")
    } finally {
      s.close()
    }
  })

  test("enqueue without a jobId leaves jobId undefined", () => {
    const s = new PendingApprovalStore()
    try {
      const id = s.enqueue({ action: "noop", payload: { a: 1 } })
      expect(s.get(id)?.jobId).toBeUndefined()
    } finally {
      s.close()
    }
  })

  test("get of an unknown id is undefined", () => {
    const s = new PendingApprovalStore()
    try {
      expect(s.get("never-enqueued")).toBeUndefined()
    } finally {
      s.close()
    }
  })

  test("list() with no status returns every row regardless of status", () => {
    const s = new PendingApprovalStore()
    try {
      const a = s.enqueue({ action: "x", payload: { n: 1 } })
      const b = s.enqueue({ action: "x", payload: { n: 2 } })
      s.resolve(b, "approved")
      const all = s.list().map((r) => r.id)
      expect(all).toContain(a)
      expect(all).toContain(b)
    } finally {
      s.close()
    }
  })
})

describe("PendingApprovalStore — resolve", () => {
  test("resolve approved moves the row out of pending and into list('approved')", () => {
    const s = new PendingApprovalStore()
    try {
      const id = s.enqueue({ jobId: "j2", action: "place_order", payload: { symbol: "MSFT", qty: 5 } })
      s.resolve(id, "approved")

      expect(s.list("pending").find((p) => p.id === id)).toBeUndefined()
      const approved = s.list("approved").find((p) => p.id === id)
      expect(approved).toBeDefined()
      expect(approved?.status).toBe("approved")
    } finally {
      s.close()
    }
  })

  test("resolve denied lands the row in list('denied')", () => {
    const s = new PendingApprovalStore()
    try {
      const id = s.enqueue({ action: "place_order", payload: { symbol: "TSLA", qty: 1 } })
      s.resolve(id, "denied")
      expect(s.list("denied").find((p) => p.id === id)?.status).toBe("denied")
      expect(s.list("pending").find((p) => p.id === id)).toBeUndefined()
    } finally {
      s.close()
    }
  })
})

describe("PendingApprovalStore — consumeApproval (one-shot)", () => {
  test("returns true once for an approved matching payload, then false (consumed)", () => {
    const s = new PendingApprovalStore()
    try {
      const payload = { symbol: "NVDA", side: "buy", qty: 3 }
      const id = s.enqueue({ jobId: "jc", action: "place_order", payload })
      s.resolve(id, "approved")

      // First consume matches and flips the row terminal.
      expect(s.consumeApproval("jc", "place_order", payload)).toBe(true)
      // Second consume of the same (job, action, payload) finds nothing un-consumed.
      expect(s.consumeApproval("jc", "place_order", payload)).toBe(false)
    } finally {
      s.close()
    }
  })

  test("matches on deep-equal payload (key order / structural), not reference", () => {
    const s = new PendingApprovalStore()
    try {
      const id = s.enqueue({ jobId: "jd", action: "place_order", payload: { symbol: "AAPL", qty: 2, side: "buy" } })
      s.resolve(id, "approved")
      // Different key order, structurally identical → deep-equal match.
      expect(s.consumeApproval("jd", "place_order", { qty: 2, side: "buy", symbol: "AAPL" })).toBe(true)
    } finally {
      s.close()
    }
  })

  test("does not consume when payload differs", () => {
    const s = new PendingApprovalStore()
    try {
      const id = s.enqueue({ jobId: "je", action: "place_order", payload: { symbol: "AAPL", qty: 2 } })
      s.resolve(id, "approved")
      expect(s.consumeApproval("je", "place_order", { symbol: "AAPL", qty: 99 })).toBe(false)
      // The original approval is untouched and still consumable.
      expect(s.consumeApproval("je", "place_order", { symbol: "AAPL", qty: 2 })).toBe(true)
    } finally {
      s.close()
    }
  })

  test("does not consume a still-pending (un-approved) row", () => {
    const s = new PendingApprovalStore()
    try {
      s.enqueue({ jobId: "jf", action: "place_order", payload: { symbol: "AAPL", qty: 2 } })
      // Never resolved → not 'approved' → not consumable.
      expect(s.consumeApproval("jf", "place_order", { symbol: "AAPL", qty: 2 })).toBe(false)
    } finally {
      s.close()
    }
  })

  test("scopes to the job: a different jobId does not match", () => {
    const s = new PendingApprovalStore()
    try {
      const id = s.enqueue({ jobId: "owner-job", action: "place_order", payload: { symbol: "AAPL", qty: 2 } })
      s.resolve(id, "approved")
      expect(s.consumeApproval("other-job", "place_order", { symbol: "AAPL", qty: 2 })).toBe(false)
      // Right job still works.
      expect(s.consumeApproval("owner-job", "place_order", { symbol: "AAPL", qty: 2 })).toBe(true)
    } finally {
      s.close()
    }
  })

  test("consuming flips status to 'consumed' (a terminal value distinct from approved)", () => {
    const s = new PendingApprovalStore()
    try {
      const id = s.enqueue({ jobId: "jg", action: "place_order", payload: { symbol: "AAPL", qty: 2 } })
      s.resolve(id, "approved")
      s.consumeApproval("jg", "place_order", { symbol: "AAPL", qty: 2 })
      // The row is no longer reported as 'approved' (it is terminal 'consumed').
      expect(s.list("approved").find((p) => p.id === id)).toBeUndefined()
    } finally {
      s.close()
    }
  })
})

describe("PendingApprovalStore — persistence across instances", () => {
  test("a fresh instance sees a previously enqueued+approved approval and can consume it once", () => {
    const a = new PendingApprovalStore()
    const id = a.enqueue({ jobId: "jp", action: "place_order", payload: { symbol: "SPY", qty: 4 } })
    a.resolve(id, "approved")
    a.close()

    // Simulate a restart: brand-new instance over the same on-disk DB.
    const b = new PendingApprovalStore()
    try {
      const row = b.get(id)
      expect(row?.status).toBe("approved")
      expect(row?.payload).toEqual({ symbol: "SPY", qty: 4 })
      expect(b.consumeApproval("jp", "place_order", { symbol: "SPY", qty: 4 })).toBe(true)
      expect(b.consumeApproval("jp", "place_order", { symbol: "SPY", qty: 4 })).toBe(false)
    } finally {
      b.close()
    }
  })
})
