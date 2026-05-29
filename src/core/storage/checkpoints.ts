import type { Database } from "bun:sqlite"
import { openDb } from "./db"

export interface Checkpoint {
  id: string
  sessionId: string
  projectHash: string
  treeHash: string
  kind: "tool" | "turn"
  label: string | null
  createdAt: number
}

export class CheckpointStore {
  private db: Database
  constructor() {
    this.db = openDb()
  }

  insert(cp: Checkpoint): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO checkpoint (id, session_id, project_hash, tree_hash, kind, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(cp.id, cp.sessionId, cp.projectHash, cp.treeHash, cp.kind, cp.label ?? null, cp.createdAt)
  }

  listBySession(sessionId: string, kind?: "tool" | "turn"): Checkpoint[] {
    const sql = kind
      ? `SELECT * FROM checkpoint WHERE session_id = ? AND kind = ? ORDER BY created_at DESC`
      : `SELECT * FROM checkpoint WHERE session_id = ? ORDER BY created_at DESC`
    const rows = (kind ? this.db.query(sql).all(sessionId, kind) : this.db.query(sql).all(sessionId)) as Record<
      string,
      unknown
    >[]
    return rows.map((r) => ({
      id: r.id as string,
      sessionId: r.session_id as string,
      projectHash: r.project_hash as string,
      treeHash: r.tree_hash as string,
      kind: r.kind as "tool" | "turn",
      label: (r.label as string | null) ?? null,
      createdAt: r.created_at as number,
    }))
  }

  close(): void {
    this.db.close()
  }
}
