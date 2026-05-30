import { describe, expect, test } from "bun:test"
import { marketCalendar } from "@core/schedule/calendar"
import { isStale, nextRun } from "@core/schedule/compute"
import type { Schedule } from "@core/schedule/types"

describe("nextRun — once", () => {
  test("returns the exact `at` instant", () => {
    const at = Date.UTC(2026, 0, 5, 14, 30)
    const s: Schedule = { kind: "once", at }
    expect(nextRun(s, new Date("2026-01-01T00:00:00Z")).getTime()).toBe(at)
  })
})

describe("nextRun — interval", () => {
  test("adds everyMinutes to `from`", () => {
    const from = new Date("2026-01-05T15:00:00Z")
    const s: Schedule = { kind: "interval", everyMinutes: 15 }
    expect(nextRun(s, from).getTime()).toBe(from.getTime() + 15 * 60_000)
  })
})

describe("nextRun — cron", () => {
  test("`30 9 * * 1-5` fires next at 09:30 in the given tz on a weekday", () => {
    // From Mon 2026-01-05 08:00 ET, next 09:30 ET (Mon–Fri) is the same day 09:30 ET = 14:30Z.
    const s: Schedule = { kind: "cron", expr: "30 9 * * 1-5", tz: "America/New_York" }
    const n = nextRun(s, new Date("2026-01-05T13:00:00Z"))
    expect(n.toISOString()).toBe("2026-01-05T14:30:00.000Z")
  })
  test("`30 9 * * 1-5` from after the match skips to the next weekday", () => {
    // Fri 2026-01-09 10:00 ET → next weekday 09:30 ET is Mon 2026-01-12 09:30 ET = 14:30Z.
    const s: Schedule = { kind: "cron", expr: "30 9 * * 1-5", tz: "America/New_York" }
    const n = nextRun(s, new Date("2026-01-09T15:00:00Z"))
    expect(n.toISOString()).toBe("2026-01-12T14:30:00.000Z")
  })
  test("is strictly-after `from` (does not return `from` itself when it already matches)", () => {
    // Exactly at a match: 2026-01-05T14:30Z is 09:30 ET. Next must be the next day's match.
    const s: Schedule = { kind: "cron", expr: "30 9 * * 1-5", tz: "America/New_York" }
    const n = nextRun(s, new Date("2026-01-05T14:30:00Z"))
    expect(n.toISOString()).toBe("2026-01-06T14:30:00.000Z")
  })
  test("defaults to UTC when tz is omitted", () => {
    // `0 0 * * *` → next midnight UTC strictly after from.
    const s: Schedule = { kind: "cron", expr: "0 0 * * *" }
    const n = nextRun(s, new Date("2026-03-10T12:00:00Z"))
    expect(n.toISOString()).toBe("2026-03-11T00:00:00.000Z")
  })
  test("supports step + list + range fields (`*/15 9,10 1-5 * *`)", () => {
    // every 15 min, hours 9 or 10, day-of-month 1-5, in UTC.
    const s: Schedule = { kind: "cron", expr: "*/15 9,10 1-5 * *" }
    const n = nextRun(s, new Date("2026-01-03T09:07:00Z"))
    expect(n.toISOString()).toBe("2026-01-03T09:15:00.000Z")
  })
  test("handles a cron match across a DST spring-forward (America/New_York)", () => {
    // 2026 US DST starts Sun Mar 8 02:00 ET. A 02:30 local time does not exist that day;
    // the next real `30 2 * * *` is Mon Mar 9 02:30 EDT = 06:30Z.
    const s: Schedule = { kind: "cron", expr: "30 2 * * *", tz: "America/New_York" }
    const n = nextRun(s, new Date("2026-03-08T05:00:00Z")) // Sun 00:00 EST
    expect(n.toISOString()).toBe("2026-03-09T06:30:00.000Z")
  })
})

describe("nextRun — marketRelative", () => {
  test("open +0 equals nextOpen", () => {
    const from = new Date("2026-01-05T13:00:00Z")
    const s: Schedule = { kind: "marketRelative", exchange: "XNYS", anchor: "open", offsetMinutes: 0 }
    expect(nextRun(s, from).getTime()).toBe(marketCalendar.nextOpen(from).getTime())
  })
  test("close -30 is 30 minutes before nextClose", () => {
    const from = new Date("2026-01-05T15:00:00Z")
    const s: Schedule = { kind: "marketRelative", exchange: "XNYS", anchor: "close", offsetMinutes: -30 }
    expect(nextRun(s, from).getTime()).toBe(marketCalendar.nextClose(from).getTime() - 30 * 60_000)
  })
  test("open +15 is 15 minutes after nextOpen", () => {
    const from = new Date("2026-01-05T13:00:00Z")
    const s: Schedule = { kind: "marketRelative", exchange: "XNYS", anchor: "open", offsetMinutes: 15 }
    expect(nextRun(s, from).toISOString()).toBe("2026-01-05T14:45:00.000Z") // 09:45 ET
  })
})

describe("isStale", () => {
  const grace = 60 // seconds
  const scheduledAt = Date.UTC(2026, 0, 5, 14, 30)
  test("not stale exactly at the scheduled time", () => {
    expect(isStale(scheduledAt, scheduledAt, grace)).toBe(false)
  })
  test("not stale just under the grace window", () => {
    expect(isStale(scheduledAt, scheduledAt + 60_000 - 1, grace)).toBe(false)
  })
  test("not stale exactly at the grace boundary (strict greater-than)", () => {
    expect(isStale(scheduledAt, scheduledAt + 60_000, grace)).toBe(false)
  })
  test("stale just over the grace window", () => {
    expect(isStale(scheduledAt, scheduledAt + 60_000 + 1, grace)).toBe(true)
  })
  test("zero grace: any positive lateness is stale", () => {
    expect(isStale(scheduledAt, scheduledAt, 0)).toBe(false)
    expect(isStale(scheduledAt, scheduledAt + 1, 0)).toBe(true)
  })
})
