import { describe, expect, test } from "bun:test"
import { FinceptAuthError, FinceptError, InsufficientCreditsError, QuantceptError } from "@shared/errors"

describe("fincept errors", () => {
  test("FinceptError carries code, defaults to FINCEPT", () => {
    expect(new FinceptError("x").code).toBe("FINCEPT")
    expect(new FinceptError("x", "username_taken").code).toBe("username_taken")
    expect(new FinceptError("x") instanceof QuantceptError).toBe(true)
  })
  test("FinceptAuthError is a FinceptError with FINCEPT_AUTH", () => {
    const e = new FinceptAuthError()
    expect(e.code).toBe("FINCEPT_AUTH")
    expect(e instanceof FinceptError).toBe(true)
  })
  test("InsufficientCreditsError keeps required/available", () => {
    const e = new InsufficientCreditsError(5, 2)
    expect(e.code).toBe("INSUFFICIENT_CREDITS")
    expect(e.required).toBe(5)
    expect(e.available).toBe(2)
  })
})
