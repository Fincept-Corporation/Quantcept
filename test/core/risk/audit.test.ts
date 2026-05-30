import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appendOrderAudit, type OrderAuditRecord, readOrderAudit } from "@core/risk/audit"

// Hermetic: a temp config dir so the on-disk audit log lives in throwaway storage.
let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-audit-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterEach(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

describe("order audit log", () => {
  test("reading an empty/missing log returns []", () => {
    expect(readOrderAudit("ph0")).toEqual([])
  })

  test("append two records → read returns both in order, each with a numeric ts", () => {
    appendOrderAudit("ph1", { kind: "intent", symbol: "AAPL", side: "buy", qty: 10 })
    appendOrderAudit("ph1", { kind: "fill", symbol: "AAPL", side: "buy", qty: 10, price: 101 })

    const recs: OrderAuditRecord[] = readOrderAudit("ph1")
    expect(recs.length).toBe(2)
    expect(recs[0]?.kind).toBe("intent")
    expect(recs[1]?.kind).toBe("fill")
    expect(typeof recs[0]?.ts).toBe("number")
    expect(typeof recs[1]?.ts).toBe("number")
    // payload fields are preserved
    expect(recs[0]?.symbol).toBe("AAPL")
    expect(recs[1]?.price).toBe(101)
  })

  test("a record that already carries a ts keeps it (does not overwrite)", () => {
    appendOrderAudit("ph2", { kind: "intent", ts: 12345 })
    const recs = readOrderAudit("ph2")
    expect(recs[0]?.ts).toBe(12345)
  })

  test("records are scoped per project hash", () => {
    appendOrderAudit("phA", { kind: "intent" })
    appendOrderAudit("phB", { kind: "fill" })
    expect(readOrderAudit("phA").map((r) => r.kind)).toEqual(["intent"])
    expect(readOrderAudit("phB").map((r) => r.kind)).toEqual(["fill"])
  })
})
