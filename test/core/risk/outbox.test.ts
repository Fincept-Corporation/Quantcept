import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { OrderOutbox } from "@core/risk/outbox"

// Hermetic: a temp config dir so the real DB file lives in throwaway storage.
let tmp: string
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-outbox-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
})
afterAll(() => {
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

const intent = (overrides: Partial<{ accountId: string; symbol: string; side: "buy" | "sell"; qty: number }> = {}) => ({
  accountId: "default",
  symbol: "AAPL",
  side: "buy" as const,
  qty: 10,
  ...overrides,
})

describe("OrderOutbox — writeIntent dedupe (the durable anti-double-fill)", () => {
  test('first writeIntent returns "new", same key again returns "exists"', () => {
    const o = new OrderOutbox()
    expect(o.writeIntent("dedupe-1", intent())).toBe("new")
    // Same key — even with different args — must NOT insert again.
    expect(o.writeIntent("dedupe-1", intent({ symbol: "MSFT", qty: 999, side: "sell" }))).toBe("exists")
    // The original row is untouched by the rejected second write.
    const row = o.get("dedupe-1")
    expect(row?.symbol).toBe("AAPL")
    expect(row?.qty).toBe(10)
    expect(row?.side).toBe("buy")
    o.close()
  })

  test("distinct keys each insert", () => {
    const o = new OrderOutbox()
    expect(o.writeIntent("dedupe-a", intent())).toBe("new")
    expect(o.writeIntent("dedupe-b", intent())).toBe("new")
    o.close()
  })
})

describe("OrderOutbox — get round-trip + types", () => {
  test("get returns the row with correct field types and a pending status", () => {
    const o = new OrderOutbox()
    o.writeIntent("rt-1", intent({ symbol: "TSLA", side: "sell", qty: 5 }))
    const row = o.get("rt-1")
    expect(row).toBeDefined()
    expect(row?.idempotencyKey).toBe("rt-1")
    expect(row?.accountId).toBe("default")
    expect(row?.symbol).toBe("TSLA")
    expect(row?.side).toBe("sell")
    expect(row?.qty).toBe(5)
    expect(row?.status).toBe("pending")
    // Unset optional columns come back as undefined (not null).
    expect(row?.brokerOrderId).toBeUndefined()
    expect(row?.fillPrice).toBeUndefined()
    expect(typeof row?.createdAt).toBe("number")
    expect(typeof row?.updatedAt).toBe("number")
    o.close()
  })

  test("get of an unknown key is undefined", () => {
    const o = new OrderOutbox()
    expect(o.get("never-written")).toBeUndefined()
    o.close()
  })
})

describe("OrderOutbox — markFilled / markFailed", () => {
  test("markFilled sets status, brokerOrderId and fillPrice", () => {
    const o = new OrderOutbox()
    o.writeIntent("fill-1", intent())
    o.markFilled("fill-1", { brokerOrderId: "bo-123", fillPrice: 100.05 })
    const row = o.get("fill-1")
    expect(row?.status).toBe("filled")
    expect(row?.brokerOrderId).toBe("bo-123")
    expect(row?.fillPrice).toBe(100.05)
    o.close()
  })

  test("markFailed sets status to failed", () => {
    const o = new OrderOutbox()
    o.writeIntent("fail-1", intent())
    o.markFailed("fail-1")
    expect(o.get("fail-1")?.status).toBe("failed")
    o.close()
  })

  test("markFilled bumps updatedAt past createdAt", () => {
    const o = new OrderOutbox()
    o.writeIntent("ts-1", intent())
    const before = o.get("ts-1")!
    o.markFilled("ts-1", { brokerOrderId: "bo-1", fillPrice: 1 })
    const after = o.get("ts-1")!
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.createdAt)
    o.close()
  })
})

describe("OrderOutbox — persistence (crash-safety)", () => {
  test("a fresh OrderOutbox instance sees a previously written intent as pending", () => {
    const a = new OrderOutbox()
    a.writeIntent("persist-1", intent({ symbol: "NVDA", qty: 3 }))
    a.close()

    // Simulate a crash/restart: brand-new instance, same on-disk DB.
    const b = new OrderOutbox()
    const row = b.get("persist-1")
    expect(row?.status).toBe("pending")
    expect(row?.symbol).toBe("NVDA")
    expect(row?.qty).toBe(3)
    // And the dedupe survives the restart: re-writing the key is rejected.
    expect(b.writeIntent("persist-1", intent())).toBe("exists")
    b.close()
  })
})

describe("OrderOutbox — pending()", () => {
  test("pending lists only pending rows, oldest first, excluding filled/failed", () => {
    const o = new OrderOutbox()
    o.writeIntent("pend-keep", intent({ symbol: "PEND" }))
    o.writeIntent("pend-fill", intent({ symbol: "FILL" }))
    o.writeIntent("pend-fail", intent({ symbol: "FAIL" }))
    o.markFilled("pend-fill", { brokerOrderId: "bo", fillPrice: 1 })
    o.markFailed("pend-fail")

    const keys = o.pending().map((r) => r.idempotencyKey)
    expect(keys).toContain("pend-keep")
    expect(keys).not.toContain("pend-fill")
    expect(keys).not.toContain("pend-fail")
    o.close()
  })
})
