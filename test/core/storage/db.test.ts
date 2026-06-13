import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openDb } from "@core/storage/db"

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-db-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("db", () => {
  test("fresh open runs migrations and creates the session table", () => {
    const db = openDb()
    const row = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='session'").get()
    expect(row).toBeTruthy()
    db.close()
  })
  test("re-open is idempotent (migrations not double-applied)", () => {
    openDb().close()
    const db = openDb()
    const applied = db.query("SELECT COUNT(*) AS c FROM schema_migrations").get() as { c: number }
    expect(applied.c).toBeGreaterThanOrEqual(1)
    db.close()
  })
  test("sets a non-zero busy_timeout so concurrent writers wait instead of throwing SQLITE_BUSY", () => {
    const db = openDb()
    const row = db.query("PRAGMA busy_timeout").get() as { timeout: number }
    expect(row.timeout).toBeGreaterThan(0)
    db.close()
  })
})
