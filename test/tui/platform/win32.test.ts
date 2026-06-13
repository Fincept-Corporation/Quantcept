import { describe, expect, test } from "bun:test"
import { desiredInputMode } from "@tui/platform/win32"

const ENABLE_PROCESSED_INPUT = 0x0001
const ENABLE_VIRTUAL_TERMINAL_INPUT = 0x0200
const ENABLE_MOUSE_INPUT = 0x0010
const ENABLE_EXTENDED_FLAGS = 0x0080

describe("desiredInputMode", () => {
  test("clears ENABLE_PROCESSED_INPUT", () => {
    const out = desiredInputMode(ENABLE_PROCESSED_INPUT)
    expect(out & ENABLE_PROCESSED_INPUT).toBe(0)
  })

  test("sets ENABLE_VIRTUAL_TERMINAL_INPUT so conhost emits VT key sequences", () => {
    const out = desiredInputMode(0)
    expect(out & ENABLE_VIRTUAL_TERMINAL_INPUT).toBe(ENABLE_VIRTUAL_TERMINAL_INPUT)
  })

  test("preserves unrelated flags (e.g. mouse / extended)", () => {
    const start = ENABLE_PROCESSED_INPUT | ENABLE_MOUSE_INPUT | ENABLE_EXTENDED_FLAGS
    const out = desiredInputMode(start)
    expect(out & ENABLE_MOUSE_INPUT).toBe(ENABLE_MOUSE_INPUT)
    expect(out & ENABLE_EXTENDED_FLAGS).toBe(ENABLE_EXTENDED_FLAGS)
    expect(out & ENABLE_PROCESSED_INPUT).toBe(0)
    expect(out & ENABLE_VIRTUAL_TERMINAL_INPUT).toBe(ENABLE_VIRTUAL_TERMINAL_INPUT)
  })

  test("is idempotent — applying twice yields the same mode", () => {
    const once = desiredInputMode(0x01f7)
    expect(desiredInputMode(once)).toBe(once)
  })

  test("returns an unsigned 32-bit value even when the high bit is set", () => {
    const out = desiredInputMode(0x8000_0001)
    expect(out).toBeGreaterThan(0)
    expect(out & ENABLE_VIRTUAL_TERMINAL_INPUT).toBe(ENABLE_VIRTUAL_TERMINAL_INPUT)
  })
})
