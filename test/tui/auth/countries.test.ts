import { describe, expect, test } from "bun:test"
import { COUNTRIES, filterCountries } from "@tui/components/auth/countries"

describe("filterCountries", () => {
  test("empty query returns the full list", () => {
    expect(filterCountries("")).toBe(COUNTRIES)
    expect(filterCountries("   ").length).toBe(COUNTRIES.length)
  })

  test("matches by name (case-insensitive)", () => {
    const r = filterCountries("india")
    expect(r.some((c) => c.name === "India" && c.dial === "91")).toBe(true)
  })

  test("matches by dial code, with or without a leading +", () => {
    expect(filterCountries("+91").some((c) => c.name === "India")).toBe(true)
    expect(filterCountries("44").some((c) => c.name === "United Kingdom")).toBe(true)
  })

  test("no match returns empty", () => {
    expect(filterCountries("zzzznotacountry")).toEqual([])
  })

  test("every entry has a name and a numeric dial", () => {
    for (const c of COUNTRIES) {
      expect(c.name.length).toBeGreaterThan(0)
      expect(/^\d+$/.test(c.dial)).toBe(true)
    }
  })
})
