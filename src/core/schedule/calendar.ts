/**
 * NYSE (XNYS) market calendar.
 *
 * All reasoning is done in America/New_York wall-clock time, derived from a UTC
 * `Date` via `Intl.DateTimeFormat(...).formatToParts()`. We never rely on the
 * host's local timezone.
 *
 * Sessions:
 *  - Regular: 09:30–16:00 ET (minute-of-day [570, 960)).
 *  - Half-day (early close): 09:30–13:00 ET (minute-of-day [570, 780)).
 *
 * Holidays (full closures) and early closes are computed by rule (no hardcoded
 * year tables), so the calendar is correct for any year. Weekend observance for
 * fixed-date holidays: a Saturday holiday is observed the preceding Friday, a
 * Sunday holiday the following Monday (NYSE convention).
 */

const ET_TZ = "America/New_York"

const OPEN_MIN = 570 // 09:30
const EARLY_CLOSE_MIN = 780 // 13:00
const REGULAR_CLOSE_MIN = 960 // 16:00

/** ET wall-clock fields for a given instant. */
interface EtParts {
  year: number
  month: number // 1-12
  day: number // 1-31
  hour: number // 0-23
  minute: number
  weekday: number // 0=Sun .. 6=Sat (derived from the ET calendar date)
}

const etFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/** Project a UTC instant onto America/New_York wall-clock fields. */
function etPartsOf(d: Date): EtParts {
  const parts = etFormatter.formatToParts(d)
  const get = (t: string): number => {
    const v = parts.find((p) => p.type === t)?.value
    return v === undefined ? Number.NaN : Number(v)
  }
  const year = get("year")
  const month = get("month")
  const day = get("day")
  // `hour: "2-digit"` with hour12:false can emit "24" at midnight in some
  // engines; normalize 24 → 0.
  let hour = get("hour")
  if (hour === 24) hour = 0
  const minute = get("minute")
  // Weekday from the ET calendar date (independent of host tz): build the date
  // as a UTC midnight and read its UTC weekday.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return { year, month, day, hour, minute, weekday }
}

/** Day-of-week (0=Sun) for an ET calendar date (year, month 1-12, day). */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/**
 * Construct the UTC `Date` corresponding to a specific America/New_York
 * wall-clock instant (year, month 1-12, day, hour, minute).
 *
 * Technique: the UTC instant equals `Date.UTC(wall) - offsetMs`, where offset is
 * the ET UTC offset *at that instant*. We don't know the offset a priori, so we
 * estimate it: start from `Date.UTC(wall)` as a guess, format it back to ET, and
 * measure how far the produced wall-clock is from the target. Correct by that
 * delta and repeat. The offset is piecewise-constant, so one correction suffices
 * away from DST edges; we iterate (bounded) to converge near transitions. We do
 * NOT round-trip-validate (a wall-clock time inside the spring-forward gap does
 * not exist); callers that need a *real* local time (cron) validate separately.
 */
function etWallClockToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Target wall-clock expressed as a "pseudo-UTC" epoch (what the ms value would
  // be if the wall-clock were UTC). The real UTC instant is this minus offset.
  const targetPseudo = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  let utcMs = targetPseudo // first guess: offset 0
  for (let i = 0; i < 3; i++) {
    const p = etPartsOf(new Date(utcMs))
    const producedPseudo = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0)
    const deltaMs = targetPseudo - producedPseudo
    if (deltaMs === 0) break
    utcMs += deltaMs
  }
  return new Date(utcMs)
}

// ── Holiday rule helpers ─────────────────────────────────────────────────────

/** nth (1-based) weekday-of-month as a calendar day number. weekday: 0=Sun..6=Sat. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  const firstDow = weekdayOf(year, month, 1)
  const offset = (weekday - firstDow + 7) % 7
  return 1 + offset + (n - 1) * 7
}

/** Last weekday-of-month (e.g. last Monday) as a calendar day number. */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const lastDow = weekdayOf(year, month, daysInMonth)
  const offset = (lastDow - weekday + 7) % 7
  return daysInMonth - offset
}

/** Easter Sunday (Gregorian) via the Anonymous Gregorian / computus algorithm. */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

/**
 * Observed calendar day for a fixed-date holiday, applying NYSE weekend
 * observance: Saturday → preceding Friday, Sunday → following Monday. Returns
 * the observed { month, day } (may shift across a month boundary, e.g. a Sunday
 * holiday on the last day of a month — not the case for any NYSE holiday, but
 * handled correctly via Date arithmetic).
 */
function observedFixed(year: number, month: number, day: number): { month: number; day: number } {
  const dow = weekdayOf(year, month, day)
  // Saturday (6) → preceding Friday; Sunday (0) → following Monday; else no shift.
  let shift = 0
  if (dow === 6) shift = -1
  else if (dow === 0) shift = +1
  if (shift === 0) return { month, day }
  const observed = new Date(Date.UTC(year, month - 1, day + shift))
  return { month: observed.getUTCMonth() + 1, day: observed.getUTCDate() }
}

/** Set of full-closure holidays for a year, keyed "M-D" on the *observed* date. */
function holidaySet(year: number): Set<string> {
  const s = new Set<string>()
  const add = (month: number, day: number) => s.add(`${month}-${day}`)

  // Fixed-date holidays (with weekend observance).
  for (const [m, d] of [
    [1, 1], // New Year's Day
    [7, 4], // Independence Day
    [12, 25], // Christmas
  ] as const) {
    const o = observedFixed(year, m, d)
    add(o.month, o.day)
  }
  // Juneteenth — federal/NYSE holiday effective 2022+.
  if (year >= 2022) {
    const o = observedFixed(year, 6, 19)
    add(o.month, o.day)
  }

  // Floating Monday/Thursday holidays (never need observance shifting).
  add(1, nthWeekdayOfMonth(year, 1, 1, 3)) // MLK Jr. Day — 3rd Mon Jan
  add(2, nthWeekdayOfMonth(year, 2, 1, 3)) // Washington's Birthday — 3rd Mon Feb
  add(5, lastWeekdayOfMonth(year, 5, 1)) // Memorial Day — last Mon May
  add(9, nthWeekdayOfMonth(year, 9, 1, 1)) // Labor Day — 1st Mon Sep
  add(11, nthWeekdayOfMonth(year, 11, 4, 4)) // Thanksgiving — 4th Thu Nov

  // Good Friday — 2 days before Easter Sunday.
  const easter = easterSunday(year)
  const gf = new Date(Date.UTC(year, easter.month - 1, easter.day - 2))
  add(gf.getUTCMonth() + 1, gf.getUTCDate())

  return s
}

/**
 * Early-close (13:00 ET half-day) rules:
 *  - Day after Thanksgiving (the Friday after the 4th Thursday of November).
 *  - Christmas Eve (Dec 24) when it falls on a weekday. (NYSE half-day; if Dec 24
 *    is a weekend there is no session at all.)
 *  - July 3 when it falls on a weekday AND July 4 is a *normal trading day* that
 *    year. If July 4 is a weekend, July 3/5 is the observed holiday (full
 *    closure), so there is no July-3 half-day in that case.
 */
function earlyCloseSet(year: number): Set<string> {
  const s = new Set<string>()
  const add = (month: number, day: number) => s.add(`${month}-${day}`)

  // Day after Thanksgiving = 4th Thursday of Nov + 1 day (always a Friday).
  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4)
  add(11, thanksgiving + 1)

  // Christmas Eve, only when Dec 24 is Mon–Fri.
  const dec24Dow = weekdayOf(year, 12, 24)
  if (dec24Dow >= 1 && dec24Dow <= 5) add(12, 24)

  // July 3 half-day: only when Jul 3 is a weekday AND Jul 4 is itself a normal
  // trading day (i.e. Jul 4 is a weekday — otherwise Jul 4 is observed elsewhere
  // and that observance, not a Jul-3 half-day, applies).
  const jul3Dow = weekdayOf(year, 7, 3)
  const jul4Dow = weekdayOf(year, 7, 4)
  const jul4IsTradingDay = jul4Dow >= 1 && jul4Dow <= 5 // Jul 4 is never a floating holiday
  if (jul3Dow >= 1 && jul3Dow <= 5 && jul4IsTradingDay) add(7, 3)

  return s
}

// ── Public calendar surface ──────────────────────────────────────────────────

function isWeekend(p: EtParts): boolean {
  return p.weekday === 0 || p.weekday === 6
}

function isHolidayParts(p: EtParts): boolean {
  return holidaySet(p.year).has(`${p.month}-${p.day}`)
}

function isEarlyCloseParts(p: EtParts): boolean {
  if (isWeekend(p) || isHolidayParts(p)) return false
  return earlyCloseSet(p.year).has(`${p.month}-${p.day}`)
}

/** True iff the ET date of `p` is a trading day (not weekend, not full holiday). */
function isTradingDayParts(p: EtParts): boolean {
  return !isWeekend(p) && !isHolidayParts(p)
}

function closeMinuteFor(p: EtParts): number {
  return isEarlyCloseParts(p) ? EARLY_CLOSE_MIN : REGULAR_CLOSE_MIN
}

/** The 09:30 ET open instant for the ET date of `p`. */
function openInstant(p: EtParts): Date {
  return etWallClockToUtc(p.year, p.month, p.day, 9, 30)
}

/** The close instant (13:00 or 16:00 ET) for the ET date of `p`. */
function closeInstant(p: EtParts): Date {
  const min = closeMinuteFor(p)
  return etWallClockToUtc(p.year, p.month, p.day, Math.floor(min / 60), min % 60)
}

/** Advance `p`'s ET date by one calendar day, returning fresh ET parts at ET noon. */
function nextEtDate(p: EtParts): EtParts {
  // Noon ET avoids any DST gap/overlap when re-projecting the incremented date.
  const noon = etWallClockToUtc(p.year, p.month, p.day, 12, 0)
  const tomorrowNoon = new Date(noon.getTime() + 24 * 60 * 60 * 1000)
  // Re-derive ET parts (handles month/year rollover and DST cleanly).
  return etPartsOf(tomorrowNoon)
}

export const marketCalendar = {
  isHoliday(d: Date): boolean {
    return isHolidayParts(etPartsOf(d))
  },

  isEarlyClose(d: Date): boolean {
    return isEarlyCloseParts(etPartsOf(d))
  },

  isMarketOpen(d: Date): boolean {
    const p = etPartsOf(d)
    if (!isTradingDayParts(p)) return false
    const minuteOfDay = p.hour * 60 + p.minute
    const closeMin = closeMinuteFor(p)
    return minuteOfDay >= OPEN_MIN && minuteOfDay < closeMin
  },

  /**
   * The next instant the market opens at/after `from`: today's 09:30 ET if `from`
   * is a trading day at/before the open, otherwise the open of the next trading day.
   */
  nextOpen(from: Date): Date {
    let p = etPartsOf(from)
    // Same-day open only counts if today is a trading day and `from` is at/before it.
    if (isTradingDayParts(p)) {
      const open = openInstant(p)
      if (from.getTime() <= open.getTime()) return open
    }
    // Otherwise scan forward to the next trading day and return its open.
    for (let i = 0; i < 400; i++) {
      p = nextEtDate(p)
      if (isTradingDayParts(p)) return openInstant(p)
    }
    throw new Error("marketCalendar.nextOpen: no trading day found within 400 days")
  },

  /**
   * The next close instant (13:00 or 16:00 ET) at/after `from`: today's close if
   * today is a trading day and `from` is at/before it, otherwise the next
   * trading day's close.
   */
  nextClose(from: Date): Date {
    let p = etPartsOf(from)
    if (isTradingDayParts(p)) {
      const close = closeInstant(p)
      if (from.getTime() <= close.getTime()) return close
    }
    for (let i = 0; i < 400; i++) {
      p = nextEtDate(p)
      if (isTradingDayParts(p)) return closeInstant(p)
    }
    throw new Error("marketCalendar.nextClose: no trading day found within 400 days")
  },

  /** Trading-session bounds for the ET date of `d`, or null if not a trading day. */
  sessionFor(d: Date): { open: Date; close: Date } | null {
    const p = etPartsOf(d)
    if (!isTradingDayParts(p)) return null
    return { open: openInstant(p), close: closeInstant(p) }
  },
}
