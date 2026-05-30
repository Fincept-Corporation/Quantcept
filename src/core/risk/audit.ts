// src/core/risk/audit.ts
//
// appendOrderAudit / readOrderAudit — the append-only external-action log (the
// trade-safety audit trail). Every order tool (place_order's intent→reserve→
// fill / failed / replay) emits a record here via the `onAudit` hook wired in
// buildAgentRegistry, so the full lifecycle of any real-world placement is
// durably recorded out-of-band of the LLM transcript.
//
// This is intentionally a plain JSONL file (not the SQLite spine): an audit log
// is append-only, human-greppable, and must survive a corrupt/locked DB. It is
// NEVER read back into a decision path — it exists purely for forensics and the
// human-in-the-loop reviewing what an autonomous job actually did.

import path from "node:path"
import { appendJsonl, readJsonl } from "@core/storage/jsonl"
import { ensureDir, riskAuditFile } from "@core/storage/paths"

export interface OrderAuditRecord {
  /** Discriminator: intent | reserve | fill | failed | replay (free-form). */
  kind: string
  /** Epoch millis the record was appended (stamped here when absent). */
  ts: number
  [k: string]: unknown
}

/**
 * Append one order-audit record for `projectHashValue`. A `ts` (epoch millis) is
 * stamped at write time when the record does not already carry one, so every line
 * is timestamped regardless of the caller. Creates the parent dir lazily.
 */
export function appendOrderAudit(projectHashValue: string, rec: Record<string, unknown>): void {
  const file = riskAuditFile(projectHashValue)
  ensureDir(path.dirname(file))
  const stamped = "ts" in rec && typeof rec.ts === "number" ? rec : { ...rec, ts: Date.now() }
  appendJsonl(file, stamped)
}

/** Read every audit record for `projectHashValue`, oldest first. Missing log → []. */
export function readOrderAudit(projectHashValue: string): OrderAuditRecord[] {
  return readJsonl<OrderAuditRecord>(riskAuditFile(projectHashValue))
}
