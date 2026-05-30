import { describe, expect, test } from "bun:test"
import { marketCalendar } from "@core/schedule/calendar"

/**
 * All dates below are ET *calendar* dates. We construct the probe `Date` as a
 * mid-session UTC instant (17:00Z) so it lands inside the trading window on the
 * intended ET date regardless of whether that date is EST (-5 → 12:00 ET) or
 * EDT (-4 → 13:00 ET) — both are comfortably inside 09:30–16:00, avoiding any
 * tz boundary ambiguity for holiday / early-close classification.
 */
const et = (ymd: string, z = "17:00:00") => new Date(`${ymd}T${z}Z`)

describe("marketCalendar.isHoliday (2026 full closures)", () => {
  const holidays: Array<[string, string]> = [
    ["2026-01-01", "New Year's Day"],
    ["2026-01-19", "MLK Jr. Day (3rd Mon Jan)"],
    ["2026-02-16", "Washington's Birthday (3rd Mon Feb)"],
    ["2026-04-03", "Good Friday (Easter Apr 5)"],
    ["2026-05-25", "Memorial Day (last Mon May)"],
    ["2026-06-19", "Juneteenth"],
    ["2026-07-03", "Independence Day observed (Jul 4 is Sat)"],
    ["2026-09-07", "Labor Day (1st Mon Sep)"],
    ["2026-11-26", "Thanksgiving (4th Thu Nov)"],
    ["2026-12-25", "Christmas"],
  ]
  for (const [ymd, label] of holidays) {
    test(`${ymd} is a holiday — ${label}`, () => {
      expect(marketCalendar.isHoliday(et(ymd))).toBe(true)
      expect(marketCalendar.isMarketOpen(et(ymd))).toBe(false)
    })
  }
})

describe("marketCalendar.isEarlyClose (2026 half-days)", () => {
  test("2026-11-27 (day after Thanksgiving) is an early close, not a holiday", () => {
    expect(marketCalendar.isEarlyClose(et("2026-11-27"))).toBe(true)
    expect(marketCalendar.isHoliday(et("2026-11-27"))).toBe(false)
  })
  test("2026-12-24 (Christmas Eve, a Thursday) is an early close, not a holiday", () => {
    expect(marketCalendar.isEarlyClose(et("2026-12-24"))).toBe(true)
    expect(marketCalendar.isHoliday(et("2026-12-24"))).toBe(false)
  })
  test("a normal trading day is not an early close", () => {
    expect(marketCalendar.isEarlyClose(et("2026-01-05"))).toBe(false)
  })
})

describe("marketCalendar.isMarketOpen (regular session boundaries)", () => {
  // 2026-01-05 is a Monday (EST, -5): 15:00Z = 10:00 ET, 14:00Z = 09:00 ET, 21:30Z = 16:30 ET.
  test("normal weekday 2026-01-05 at 10:00 ET is open", () => {
    expect(marketCalendar.isMarketOpen(et("2026-01-05", "15:00:00"))).toBe(true)
  })
  test("2026-01-05 at 09:00 ET (before open) is closed", () => {
    expect(marketCalendar.isMarketOpen(et("2026-01-05", "14:00:00"))).toBe(false)
  })
  test("2026-01-05 at 16:30 ET (after close) is closed", () => {
    expect(marketCalendar.isMarketOpen(et("2026-01-05", "21:30:00"))).toBe(false)
  })
  test("exactly 09:30 ET is open; exactly 16:00 ET is closed (half-open window)", () => {
    expect(marketCalendar.isMarketOpen(et("2026-01-05", "14:30:00"))).toBe(true) // 09:30 ET
    expect(marketCalendar.isMarketOpen(et("2026-01-05", "21:00:00"))).toBe(false) // 16:00 ET
  })
  test("weekend 2026-01-03 (Sat) is closed", () => {
    expect(marketCalendar.isMarketOpen(et("2026-01-03"))).toBe(false)
  })
})

describe("marketCalendar.isMarketOpen on an early-close day (2026-11-27, EST -5)", () => {
  // 18:30Z = 13:30 ET (after 13:00 early close), 17:30Z = 12:30 ET (still open).
  test("13:30 ET is closed (early close at 13:00)", () => {
    expect(marketCalendar.isMarketOpen(et("2026-11-27", "18:30:00"))).toBe(false)
  })
  test("12:30 ET is open", () => {
    expect(marketCalendar.isMarketOpen(et("2026-11-27", "17:30:00"))).toBe(true)
  })
  test("exactly 13:00 ET is closed on the early-close day", () => {
    expect(marketCalendar.isMarketOpen(et("2026-11-27", "18:00:00"))).toBe(false)
  })
})

describe("marketCalendar.sessionFor", () => {
  test("returns 09:30–16:00 ET bounds on a normal day", () => {
    const s = marketCalendar.sessionFor(et("2026-01-05"))
    expect(s).not.toBeNull()
    // 09:30 EST = 14:30Z, 16:00 EST = 21:00Z
    expect(s?.open.toISOString()).toBe("2026-01-05T14:30:00.000Z")
    expect(s?.close.toISOString()).toBe("2026-01-05T21:00:00.000Z")
  })
  test("returns a 13:00 close on an early-close day", () => {
    const s = marketCalendar.sessionFor(et("2026-11-27"))
    expect(s?.close.toISOString()).toBe("2026-11-27T18:00:00.000Z") // 13:00 EST
  })
  test("returns null on a holiday", () => {
    expect(marketCalendar.sessionFor(et("2026-01-01"))).toBeNull()
  })
  test("returns null on a weekend", () => {
    expect(marketCalendar.sessionFor(et("2026-01-03"))).toBeNull()
  })
})

describe("marketCalendar.nextOpen", () => {
  test("before open on a trading day returns today's 09:30 ET", () => {
    // 2026-01-05 08:00 ET = 13:00Z
    const n = marketCalendar.nextOpen(et("2026-01-05", "13:00:00"))
    expect(n.toISOString()).toBe("2026-01-05T14:30:00.000Z")
  })
  test("after open on a trading day rolls to the next trading day's open", () => {
    // 2026-01-05 12:00 ET → next open is Tue 2026-01-06 09:30 ET = 14:30Z
    const n = marketCalendar.nextOpen(et("2026-01-05", "17:00:00"))
    expect(n.toISOString()).toBe("2026-01-06T14:30:00.000Z")
  })
  test("on a weekend returns Monday's open", () => {
    // Sat 2026-01-03 → Mon 2026-01-05 09:30 ET
    const n = marketCalendar.nextOpen(et("2026-01-03"))
    expect(n.toISOString()).toBe("2026-01-05T14:30:00.000Z")
  })
  test("skips a holiday: from 2026-01-01 (Thu holiday) → Fri 2026-01-02 open", () => {
    const n = marketCalendar.nextOpen(et("2026-01-01"))
    expect(n.toISOString()).toBe("2026-01-02T14:30:00.000Z")
  })
})

describe("marketCalendar.nextClose", () => {
  test("during a session returns today's 16:00 ET close", () => {
    // 2026-01-05 10:00 ET → close 16:00 ET = 21:00Z
    const n = marketCalendar.nextClose(et("2026-01-05", "15:00:00"))
    expect(n.toISOString()).toBe("2026-01-05T21:00:00.000Z")
  })
  test("before open returns today's close", () => {
    const n = marketCalendar.nextClose(et("2026-01-05", "13:00:00")) // 08:00 ET
    expect(n.toISOString()).toBe("2026-01-05T21:00:00.000Z")
  })
  test("after close rolls to the next trading day's close", () => {
    const n = marketCalendar.nextClose(et("2026-01-05", "22:00:00")) // 17:00 ET
    expect(n.toISOString()).toBe("2026-01-06T21:00:00.000Z")
  })
  test("returns the 13:00 ET close on an early-close day", () => {
    const n = marketCalendar.nextClose(et("2026-11-27", "15:00:00")) // 10:00 ET
    expect(n.toISOString()).toBe("2026-11-27T18:00:00.000Z") // 13:00 EST
  })
})
