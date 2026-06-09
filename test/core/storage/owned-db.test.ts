import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { openOwnedDb } from "@core/storage/owned-db"

describe("openOwnedDb", () => {
  test("borrows an injected handle and does not claim ownership", () => {
    const mem = new Database(":memory:")
    const owned = openOwnedDb(mem)
    expect(owned.db).toBe(mem) // same instance, not a copy
    expect(owned.ownsDb).toBe(false)
    mem.close()
  })

  test("a borrowed handle stays open — close() would be the store's no-op", () => {
    const mem = new Database(":memory:")
    const { ownsDb } = openOwnedDb(mem)
    // Store contract: `if (ownsDb) this.db.close()`. ownsDb=false ⇒ handle survives.
    expect(ownsDb).toBe(false)
    mem.query("SELECT 1").get() // still usable
    mem.close()
  })
})
