import { describe, expect, test } from "bun:test"
import { queryString } from "@core/fincept/http"

describe("queryString", () => {
  test("missing params → empty string", () => {
    expect(queryString()).toBe("")
    expect(queryString({})).toBe("")
  })
  test("skips undefined and empty-string values", () => {
    expect(queryString({ a: 1, b: undefined, c: "" })).toBe("?a=1")
  })
  test("coerces number and boolean", () => {
    expect(queryString({ n: 5, b: true })).toBe("?n=5&b=true")
  })
  test("URL-encodes values", () => {
    expect(queryString({ q: "a b&c" })).toBe("?q=a+b%26c")
  })
  test("all values empty → empty string (no bare ?)", () => {
    expect(queryString({ a: undefined, b: "" })).toBe("")
  })
})
