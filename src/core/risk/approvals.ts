// src/core/risk/approvals.ts
//
// PendingApprovalStore — the durable approval queue for irreversible actions
// (the trade-safety "approve/resume" primitive) over the `pending_approval`
// table. When an autonomous job proposes an irreversible order, the engine
// enqueues a `pending` approval; a human resolves it `approved`/`denied`; on a
// later resume the job's pipeline `consumeApproval`s a matching `approved` row
// EXACTLY once before letting the placement through.
//
// Status set (the column is free-form TEXT in the schema): one of
//   pending  — enqueued, awaiting a human decision
//   approved — a human approved it; still un-consumed (consumable once)
//   denied   — a human rejected it; terminal
//   consumed — an `approved` row that has been spent by consumeApproval; terminal
//
// `consumed` is the one-shot marker: consumeApproval finds a still-`approved`
// row matching (jobId, action, deep-equal payload), flips it `approved→consumed`
// atomically, and returns true; a second consume of the same logical action
// finds nothing un-consumed and returns false. This is the guard that a single
// approval can never authorize two fills.
//
// Like the ledger/outbox, this is NOT a Tool — the LLM never touches it. The
// engine and the human-in-the-loop drive it.

import type { Database } from "bun:sqlite"
import { openDb } from "@core/storage/db"

export interface PendingApproval {
  id: string
  jobId?: string
  action: string
  payload: unknown
  status: "pending" | "approved" | "denied"
  createdAt: number
}

interface ApprovalDbRow {
  id: string
  job_id: string | null
  action: string
  payload: string
  status: string
  created_at: number
}

/**
 * Canonical JSON: serialize with object keys sorted recursively so two
 * structurally-identical payloads (differing only in key order) produce the
 * SAME string. Used both to store payloads and to match them in consumeApproval,
 * so the deep-equal match reduces to a plain string compare in SQL.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/** Map a DB row to the public shape. `consumed` is reported as `approved`-derived only via list filters; the public status union never surfaces it (consumed rows are filtered out of list("approved")). */
function toApproval(r: ApprovalDbRow): PendingApproval {
  return {
    id: r.id,
    jobId: r.job_id ?? undefined,
    action: r.action,
    payload: r.payload === "" ? undefined : JSON.parse(r.payload),
    // The column may hold "consumed"; the public union only declares the three
    // user-facing states. We narrow here — callers see "approved" rows via
    // list("approved") (which excludes consumed) and inspect terminal state via get().
    status: r.status as PendingApproval["status"],
    createdAt: r.created_at,
  }
}

export class PendingApprovalStore {
  private db: Database
  private ownsDb: boolean

  constructor(opts?: { db?: Database }) {
    if (opts?.db) {
      this.db = opts.db
      this.ownsDb = false
    } else {
      this.db = openDb()
      this.ownsDb = true
    }
  }

  /** Enqueue a new `pending` approval. Payload is canonical-JSON serialized. Returns the new id. */
  enqueue(a: { jobId?: string; action: string; payload: unknown }): string {
    const id = crypto.randomUUID()
    const now = Date.now()
    this.db
      .query(
        "INSERT INTO pending_approval (id, job_id, action, payload, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
      )
      .run(id, a.jobId ?? null, a.action, canonicalJson(a.payload), now)
    return id
  }

  /** List approvals, optionally filtered to a single status; oldest first. */
  list(status?: "pending" | "approved" | "denied"): PendingApproval[] {
    const rows = status
      ? (this.db
          .query("SELECT * FROM pending_approval WHERE status = ? ORDER BY created_at ASC")
          .all(status) as ApprovalDbRow[])
      : (this.db.query("SELECT * FROM pending_approval ORDER BY created_at ASC").all() as ApprovalDbRow[])
    return rows.map(toApproval)
  }

  get(id: string): PendingApproval | undefined {
    const r = this.db.query("SELECT * FROM pending_approval WHERE id = ?").get(id) as ApprovalDbRow | undefined
    return r ? toApproval(r) : undefined
  }

  /** Resolve a pending approval to a human decision (approved/denied). */
  resolve(id: string, status: "approved" | "denied"): void {
    this.db.query("UPDATE pending_approval SET status = ? WHERE id = ?").run(status, id)
  }

  /**
   * Consume the first still-`approved` (un-consumed) approval for `jobId` matching
   * `action` + deep-equal `payload`. Flips it `approved → consumed` atomically and
   * returns true if a match was consumed; false otherwise. One-shot: a second call
   * for the same logical action returns false (the row is now `consumed`).
   *
   * Atomicity: the UPDATE itself carries the WHERE predicate and we read `changes`,
   * so under sqlite's single-writer model exactly one caller can win the flip — no
   * read-then-write race that could double-consume.
   */
  consumeApproval(jobId: string, action: string, payload: unknown): boolean {
    const canon = canonicalJson(payload)
    // Pick the oldest matching approved row id, then flip just that one.
    const target = this.db
      .query(
        `SELECT id FROM pending_approval
           WHERE job_id = ? AND action = ? AND payload = ? AND status = 'approved'
           ORDER BY created_at ASC
           LIMIT 1`,
      )
      .get(jobId, action, canon) as { id: string } | undefined
    if (!target) return false

    const res = this.db
      .query("UPDATE pending_approval SET status = 'consumed' WHERE id = ? AND status = 'approved'")
      .run(target.id)
    // changes === 1 iff we won the flip (still 'approved' at update time).
    return res.changes > 0
  }

  close(): void {
    if (this.ownsDb) this.db.close()
  }
}
