import type { Database } from "bun:sqlite"
import { openDb } from "./db"

/**
 * Borrow a caller-supplied SQLite handle, or open the shared index DB and remember we
 * own it. A store calls this in its constructor and closes its handle only when
 * `ownsDb` is true — so an injected handle (a test's `:memory:` db, or a shared
 * connection) outlives the store instead of being closed out from under its owner.
 *
 * This is the ONE seam for how a durable store obtains its handle: pooling, WAL tuning,
 * or test injection all live here instead of being re-implemented in every store.
 */
export function openOwnedDb(injected?: Database): { db: Database; ownsDb: boolean } {
  return injected ? { db: injected, ownsDb: false } : { db: openDb(), ownsDb: true }
}
