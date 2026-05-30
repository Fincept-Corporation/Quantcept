import { describe, expect, test } from "bun:test"
import { DEFAULT_SUPPRESS_PATTERNS, shouldSuppressCapture } from "@core/tools/computeruse/redact"

const def = DEFAULT_SUPPRESS_PATTERNS

describe("capture redaction (window suppression)", () => {
  test("suppresses Quantcept's own window so it can't screenshot its config/secrets", () => {
    expect(shouldSuppressCapture("Quantcept — Settings", def)).toBe(true)
  })

  test("suppresses an .env / config editor window", () => {
    expect(shouldSuppressCapture("C:/projects/Quantcept/.env — Notepad", def)).toBe(true)
  })

  test("suppresses common password managers", () => {
    expect(shouldSuppressCapture("1Password", def)).toBe(true)
    expect(shouldSuppressCapture("Bitwarden - Vault", def)).toBe(true)
  })

  test("is case-insensitive", () => {
    expect(shouldSuppressCapture("MY SECRET KEYS", def)).toBe(true)
  })

  test("does not suppress a normal broker/browser window", () => {
    expect(shouldSuppressCapture("EDGAR — Company Search — Chrome", def)).toBe(false)
  })

  test("does not suppress when title is unknown", () => {
    expect(shouldSuppressCapture(undefined, def)).toBe(false)
  })

  test("respects custom suppress patterns", () => {
    expect(shouldSuppressCapture("Internal Trading Desk", ["trading desk"])).toBe(true)
  })
})
