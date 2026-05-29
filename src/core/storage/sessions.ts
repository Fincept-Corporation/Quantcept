import type { Database } from "bun:sqlite"
import { readdirSync } from "node:fs"
import { openDb } from "./db"
import { appendJsonl, readJsonl } from "./jsonl"
import { dataDir, projectHash, sessionFile, sessionsDir } from "./paths"

const TRANSCRIPT_VERSION = 1

export type TranscriptRecord =
  | { t: "meta"; id: string; projectHash: string; cwd: string; title?: string; createdAt: number; version: number }
  | { t: "msg"; role: "user" | "assistant"; content: string; ts: number }
  | { t: "tool"; tool: string; status: "running" | "done"; output?: unknown; isError?: boolean; ts: number }
  | { t: "tokens"; input: number; output: number; ts: number }

export interface SessionRow {
  id: string
  projectHash: string
  cwd: string
  title: string | null
  createdAt: number
  updatedAt: number
  msgCount: number
  totalTokens: number
}

export class SessionStore {
  private db: Database
  // Cache the projectHash per session id so appendEvent can locate the file.
  private hashById = new Map<string, string>()

  constructor() {
    this.db = openDb()
  }

  projectHashFor(cwd: string): string {
    return projectHash(cwd)
  }

  createSession(opts: { id: string; cwd: string; title?: string }): void {
    const ph = projectHash(opts.cwd)
    this.hashById.set(opts.id, ph)
    const now = Date.now()
    const meta: TranscriptRecord = {
      t: "meta",
      id: opts.id,
      projectHash: ph,
      cwd: opts.cwd,
      title: opts.title,
      createdAt: now,
      version: TRANSCRIPT_VERSION,
    }
    appendJsonl(sessionFile(ph, opts.id), meta)
    this.db
      .query(
        `INSERT OR REPLACE INTO session (id, project_hash, cwd, title, created_at, updated_at, msg_count, total_tokens)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
      )
      .run(opts.id, ph, opts.cwd, opts.title ?? null, now, now)
  }

  appendEvent(sessionId: string, record: TranscriptRecord): void {
    const ph = this.hashById.get(sessionId)
    if (!ph) return // unknown session — caller must createSession first
    appendJsonl(sessionFile(ph, sessionId), record)
  }

  /** Update the index row's rollups at a turn boundary. */
  touch(sessionId: string, vals: { msgCount?: number; tokens?: number; updatedAt?: number }): void {
    const now = vals.updatedAt ?? Date.now()
    this.db
      .query(
        `UPDATE session SET updated_at = ?,
           msg_count = COALESCE(?, msg_count),
           total_tokens = COALESCE(?, total_tokens)
         WHERE id = ?`,
      )
      .run(now, vals.msgCount ?? null, vals.tokens ?? null, sessionId)
  }

  loadSession(sessionId: string): TranscriptRecord[] {
    const cached = this.hashById.get(sessionId)
    if (cached) {
      const recs = readJsonl<TranscriptRecord>(sessionFile(cached, sessionId))
      if (recs.length) return recs
    }
    const row = this.db.query("SELECT project_hash FROM session WHERE id = ?").get(sessionId) as
      | { project_hash: string }
      | undefined
    if (!row) return []
    this.hashById.set(sessionId, row.project_hash)
    return readJsonl<TranscriptRecord>(sessionFile(row.project_hash, sessionId))
  }

  listSessions(projectHashValue: string): SessionRow[] {
    const rows = this.db
      .query(
        `SELECT id, project_hash, cwd, title, created_at, updated_at, msg_count, total_tokens
         FROM session WHERE project_hash = ? ORDER BY updated_at DESC`,
      )
      .all(projectHashValue) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string,
      projectHash: r.project_hash as string,
      cwd: r.cwd as string,
      title: (r.title as string | null) ?? null,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
      msgCount: r.msg_count as number,
      totalTokens: r.total_tokens as number,
    }))
  }

  /** Test/recovery helper: delete an index row (transcript stays on disk). */
  dropIndexRow(sessionId: string): void {
    this.db.query("DELETE FROM session WHERE id = ?").run(sessionId)
  }

  /** Rebuild the SQLite index from every transcript on disk. */
  rebuildIndex(): void {
    const base = `${dataDir()}/sessions`
    let projectHashes: string[]
    try {
      projectHashes = readdirSync(base)
    } catch {
      return // no sessions dir yet
    }
    for (const ph of projectHashes) {
      let files: string[]
      try {
        files = readdirSync(sessionsDir(ph)).filter((f) => f.endsWith(".jsonl"))
      } catch {
        continue
      }
      for (const file of files) {
        const id = file.replace(/\.jsonl$/, "")
        const recs = readJsonl<TranscriptRecord>(sessionFile(ph, id))
        const meta = recs.find((r) => r.t === "meta") as Extract<TranscriptRecord, { t: "meta" }> | undefined
        if (!meta) continue
        const msgCount = recs.filter((r) => r.t === "msg").length
        const tokens = recs
          .filter((r): r is Extract<TranscriptRecord, { t: "tokens" }> => r.t === "tokens")
          .reduce((s, r) => s + r.input + r.output, 0)
        const lastTs = recs.reduce((mx, r) => ("ts" in r ? Math.max(mx, r.ts) : mx), meta.createdAt)
        this.hashById.set(id, ph)
        this.db
          .query(
            `INSERT OR REPLACE INTO session (id, project_hash, cwd, title, created_at, updated_at, msg_count, total_tokens)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(id, ph, meta.cwd, meta.title ?? null, meta.createdAt, lastTs, msgCount, tokens)
      }
    }
  }

  close(): void {
    this.db.close()
  }
}
