import type { Database } from "bun:sqlite"
import { rmSync } from "node:fs"
import { openDb } from "@core/storage/db"
import { appendJsonl, readJsonl } from "@core/storage/jsonl"
import { jobFile, jobsDir, projectHash } from "@core/storage/paths"
import type { Job, JobStatus, JobTurn, PauseReason } from "./types"

// ---------------------------------------------------------------------------
// Row shape as returned by bun:sqlite
// ---------------------------------------------------------------------------
interface JobRow {
  id: string
  project_hash: string
  cwd: string
  goal: string
  status: string
  pause_reason: string | null
  success_spec: string | null
  schedule: string | null
  budget: string | null
  missed_policy: string | null
  max_turns: number
  turns_used: number
  read_only: number
  next_run_at: number | null
  last_run_at: number | null
  created_at: number
  updated_at: number
}

function rowToJob(r: JobRow): Job {
  const job: Job = {
    id: r.id,
    projectHash: r.project_hash,
    cwd: r.cwd,
    goal: r.goal,
    status: r.status as JobStatus,
    maxTurns: r.max_turns,
    turnsUsed: r.turns_used,
    readOnly: r.read_only === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
  if (r.pause_reason !== null) job.pauseReason = r.pause_reason as PauseReason
  if (r.next_run_at !== null) job.nextRunAt = r.next_run_at
  if (r.last_run_at !== null) job.lastRunAt = r.last_run_at
  if (r.success_spec !== null) {
    try {
      job.successSpec = JSON.parse(r.success_spec)
    } catch {
      job.successSpec = r.success_spec
    }
  }
  if (r.schedule !== null) {
    try {
      job.schedule = JSON.parse(r.schedule)
    } catch {
      job.schedule = r.schedule
    }
  }
  if (r.budget !== null) {
    try {
      job.budget = JSON.parse(r.budget)
    } catch {
      job.budget = r.budget
    }
  }
  if (r.missed_policy !== null) job.missedPolicy = r.missed_policy as "catch_up" | "skip"
  return job
}

// ---------------------------------------------------------------------------
// JobStore
// ---------------------------------------------------------------------------
export class JobStore {
  private db: Database
  /** Cache project_hash per job id to locate JSONL files without a DB round-trip. */
  private hashById = new Map<string, string>()

  constructor() {
    this.db = openDb()
  }

  // ---------------------------------------------------------------------------
  // Create / read
  // ---------------------------------------------------------------------------

  create(opts: {
    id: string
    cwd: string
    goal: string
    maxTurns?: number
    readOnly?: boolean
    successSpec?: unknown
    schedule?: unknown
    budget?: unknown
    missedPolicy?: "catch_up" | "skip"
  }): Job {
    const ph = projectHash(opts.cwd)
    this.hashById.set(opts.id, ph)
    const now = Date.now()
    const readOnly = (opts.readOnly ?? true) ? 1 : 0
    const maxTurns = opts.maxTurns ?? 20
    const successSpec = opts.successSpec !== undefined ? JSON.stringify(opts.successSpec) : null
    const schedule = opts.schedule !== undefined ? JSON.stringify(opts.schedule) : null
    const budget = opts.budget !== undefined ? JSON.stringify(opts.budget) : null
    const missedPolicy = opts.missedPolicy ?? null

    this.db
      .query(
        `INSERT INTO job
           (id, project_hash, cwd, goal, status, pause_reason, success_spec, schedule, budget, missed_policy,
            max_turns, turns_used, read_only, next_run_at, last_run_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, ?, ?)`,
      )
      .run(opts.id, ph, opts.cwd, opts.goal, successSpec, schedule, budget, missedPolicy, maxTurns, readOnly, now, now)

    return this.get(opts.id)!
  }

  get(id: string): Job | undefined {
    const row = this.db.query("SELECT * FROM job WHERE id = ?").get(id) as JobRow | undefined
    if (!row) return undefined
    this.hashById.set(id, row.project_hash)
    return rowToJob(row)
  }

  listByProject(projectHashValue: string): Job[] {
    const rows = this.db
      .query("SELECT * FROM job WHERE project_hash = ? ORDER BY updated_at DESC")
      .all(projectHashValue) as JobRow[]
    for (const r of rows) this.hashById.set(r.id, r.project_hash)
    return rows.map(rowToJob)
  }

  // ---------------------------------------------------------------------------
  // Turns
  // ---------------------------------------------------------------------------

  appendTurn(id: string, turn: JobTurn): void {
    const ph = this._ph(id)
    if (!ph) return
    appendJsonl(jobFile(ph, id), turn)

    const turnId = crypto.randomUUID()
    const now = Date.now()
    this.db
      .query(
        `INSERT INTO job_turn (id, job_id, seq, model, prompt_sha, text, input_tokens, output_tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        turnId,
        id,
        turn.seq,
        turn.model ?? null,
        turn.promptSha ?? null,
        turn.text,
        turn.inputTokens,
        turn.outputTokens,
        now,
      )

    this.db.query("UPDATE job SET turns_used = turns_used + 1, updated_at = ? WHERE id = ?").run(now, id)
  }

  loadTurns(id: string): JobTurn[] {
    const ph = this._ph(id)
    if (!ph) return []
    return readJsonl<JobTurn>(jobFile(ph, id))
  }

  // ---------------------------------------------------------------------------
  // Status transitions
  // ---------------------------------------------------------------------------

  markRunning(id: string): Job {
    this.db.query("UPDATE job SET status = 'running', updated_at = ? WHERE id = ?").run(Date.now(), id)
    return this.get(id)!
  }

  pause(id: string, reason: PauseReason): Job {
    this.db
      .query("UPDATE job SET status = 'paused', pause_reason = ?, updated_at = ? WHERE id = ?")
      .run(reason, Date.now(), id)
    return this.get(id)!
  }

  complete(id: string, _verdict?: unknown): Job {
    this.db
      .query("UPDATE job SET status = 'done', pause_reason = NULL, updated_at = ? WHERE id = ?")
      .run(Date.now(), id)
    return this.get(id)!
  }

  /** Make a paused/needs-human job claimable again: status→pending, clear pause_reason. */
  resume(id: string): Job {
    this.db
      .query("UPDATE job SET status = 'pending', pause_reason = NULL, updated_at = ? WHERE id = ?")
      .run(Date.now(), id)
    return this.get(id)!
  }

  fail(id: string): Job {
    this.db.query("UPDATE job SET status = 'failed', updated_at = ? WHERE id = ?").run(Date.now(), id)
    return this.get(id)!
  }

  /** Permanently remove a job: its DB row, turn rows, and the JSONL turn log (best-effort). */
  delete(id: string): void {
    const ph = this._ph(id)
    this.db.query("DELETE FROM job_turn WHERE job_id = ?").run(id)
    this.db.query("DELETE FROM job WHERE id = ?").run(id)
    this.hashById.delete(id)
    if (ph) {
      try {
        rmSync(jobFile(ph, id), { force: true })
      } catch {
        /* best-effort — the turn log may not exist */
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Scheduling helpers
  // ---------------------------------------------------------------------------

  setNextRun(id: string, ts: number): void {
    this.db.query("UPDATE job SET next_run_at = ?, updated_at = ? WHERE id = ?").run(ts, Date.now(), id)
  }

  setLastRun(id: string, ts: number): void {
    this.db.query("UPDATE job SET last_run_at = ?, updated_at = ? WHERE id = ?").run(ts, Date.now(), id)
  }

  claimDue(projectHashValue: string, now: number): Job[] {
    const rows = this.db
      .query(
        // Only 'pending' is auto-claimable. A 'paused' job (needs-human / budget / max-turns)
        // has next_run_at = NULL and must NOT be re-run every tick — it re-enters only via an
        // explicit resume() -> 'pending'.
        `SELECT * FROM job
         WHERE project_hash = ?
           AND status = 'pending'
           AND (next_run_at IS NULL OR next_run_at <= ?)
         ORDER BY created_at ASC`,
      )
      .all(projectHashValue, now) as JobRow[]
    for (const r of rows) this.hashById.set(r.id, r.project_hash)
    return rows.map(rowToJob)
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  close(): void {
    this.db.close()
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /** Resolve projectHash from cache or DB. Returns undefined if job unknown. */
  private _ph(id: string): string | undefined {
    const cached = this.hashById.get(id)
    if (cached) return cached
    const job = this.get(id)
    return job?.projectHash
  }
}
