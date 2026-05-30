import { describe, expect, test } from "bun:test"
import { evaluatePolicy, readOnlyPolicy, tradingPolicy } from "@core/tools/policy"

describe("evaluatePolicy", () => {
  test("returns the action mapped to the given effect class", () => {
    const policy = readOnlyPolicy()
    expect(evaluatePolicy("read", policy)).toBe("allow")
    expect(evaluatePolicy("write", policy)).toBe("deny")
  })
})

describe("readOnlyPolicy", () => {
  test("allows read, denies every mutating class", () => {
    const p = readOnlyPolicy()
    expect(p.read).toBe("allow")
    expect(p.write).toBe("deny")
    expect(p.compensable).toBe("deny")
    expect(p.irreversible).toBe("deny")
  })
})

describe("tradingPolicy", () => {
  test("allows read/write/compensable, gates irreversible", () => {
    const p = tradingPolicy()
    expect(p.read).toBe("allow")
    expect(p.write).toBe("allow")
    expect(p.compensable).toBe("allow")
    expect(p.irreversible).toBe("gate")
  })
})
