// src/core/storage/migrations.ts
export interface Migration {
  id: string
  sql: string
}

// Append-only, ordered. NEVER edit an applied migration — add a new one.
export const MIGRATIONS: Migration[] = [
  {
    id: "0001_session",
    sql: `
      CREATE TABLE IF NOT EXISTS session (
        id           TEXT PRIMARY KEY,
        project_hash TEXT NOT NULL,
        cwd          TEXT NOT NULL,
        title        TEXT,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        msg_count    INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS session_project_idx
        ON session(project_hash, updated_at DESC);
    `,
  },
]
