// src/core/storage/db.ts
import { Database } from "bun:sqlite"
import { MIGRATIONS } from "./migrations"
import { dataDir, dbFile, ensureDir } from "./paths"

/** Open (or create) the index DB and apply any pending migrations. */
export function openDb(): Database {
  ensureDir(dataDir())
  const db = new Database(dbFile(), { create: true })
  db.run("PRAGMA journal_mode = WAL")
  db.run("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)")
  const applied = new Set((db.query("SELECT id FROM schema_migrations").all() as { id: string }[]).map((r) => r.id))
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue
    db.run(m.sql)
    db.query("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(m.id, Date.now())
  }
  return db
}
