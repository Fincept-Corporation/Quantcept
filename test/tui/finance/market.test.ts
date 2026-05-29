import { describe, expect, test } from "bun:test"
import { formatElapsed, marketStatus } from "@tui/finance/market"

// Build a UTC instant for a given IST wall-clock time. IST = UTC+5:30.
// e.g. IST 10:00 = UTC 04:30.
function istInstant(dayUTC: number, istHour: number, istMin: number): Date {
  const utcMinutes = istHour * 60 + istMin - (5 * 60 + 30)
  return new Date(Date.UTC(2024, 0, dayUTC, Math.floor(utcMinutes / 60), utcMinutes % 60))
}

describe("marketStatus", () => {
  // 2024-01-01 is a Monday; 2024-01-06 is a Saturday; 2024-01-07 is a Sunday.
  test("open during NSE hours on a weekday", () => {
    expect(marketStatus(istInstant(1, 10, 0)).open).toBe(true) // Mon 10:00 IST
  })
  test("closed before open on a weekday", () => {
    expect(marketStatus(istInstant(1, 9, 0)).open).toBe(false) // Mon 09:00 IST
  })
  test("closed after close on a weekday", () => {
    expect(marketStatus(istInstant(1, 16, 0)).open).toBe(false) // Mon 16:00 IST
  })
  test("closed on the weekend even during market hours", () => {
    expect(marketStatus(istInstant(6, 11, 0)).open).toBe(false) // Sat 11:00 IST
    expect(marketStatus(istInstant(7, 11, 0)).open).toBe(false) // Sun 11:00 IST
  })
  test("boundaries: open at 09:15, closed at 15:30", () => {
    expect(marketStatus(istInstant(1, 9, 15)).open).toBe(true)
    expect(marketStatus(istInstant(1, 15, 30)).open).toBe(false)
  })
  test("carries a human label", () => {
    expect(marketStatus(istInstant(1, 10, 0)).label).toMatch(/open/i)
    expect(marketStatus(istInstant(1, 16, 0)).label).toMatch(/closed/i)
  })
})

describe("formatElapsed", () => {
  test("formats seconds, minutes, hours", () => {
    expect(formatElapsed(0)).toBe("0s")
    expect(formatElapsed(45_000)).toBe("45s")
    expect(formatElapsed(90_000)).toBe("1m 30s")
    expect(formatElapsed(3_661_000)).toBe("1h 1m")
  })
  test("never negative", () => {
    expect(formatElapsed(-5000)).toBe("0s")
  })
})
