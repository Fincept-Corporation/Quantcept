import { marketCalendar } from "./calendar"
import type { Schedule } from "./types"

/**
 * Compute the next run instant for a schedule, strictly relative to `from`.
 *
 * - `once`        → the fixed `at` instant.
 * - `interval`    → `from + everyMinutes`.
 * - `cron`        → next matching minute strictly after `from`, in `tz` (UTC default).
 * - `marketRelative` → the next open/close anchor (XNYS) plus an offset.
 */
export function nextRun(s: Schedule, from: Date): Date {
  switch (s.kind) {
    case "once":
      return new Date(s.at)
    case "interval":
      return new Date(from.getTime() + s.everyMinutes * 60_000)
    case "cron":
      return nextCron(s.expr, from, s.tz ?? "UTC")
    case "marketRelative": {
      const base = s.anchor === "open" ? marketCalendar.nextOpen(from) : marketCalendar.nextClose(from)
      return new Date(base.getTime() + s.offsetMinutes * 60_000)
    }
  }
}

/**
 * Staleness guard. Returns true when `now` is more than `graceSeconds` after the
 * scheduled instant — i.e. the run is too late to still be meaningful. Boundary
 * is strict greater-than, so a run exactly `graceSeconds` late is NOT stale.
 *
 * This is the finance-correctness floor: a market task fired far after its
 * scheduled time (e.g. a "5 min after open" snapshot delivered at lunch) should
 * be refused rather than run on stale conditions.
 */
export function isStale(scheduledAt: number, now: number, graceSeconds: number): boolean {
  return now - scheduledAt > graceSeconds * 1000
}

// ── Minimal 5-field cron parser ──────────────────────────────────────────────

/**
 * A parsed cron field: the set of integer values that satisfy it, within the
 * field's [min, max] domain.
 */
type CronField = Set<number>

interface ParsedCron {
  minute: CronField // 0-59
  hour: CronField // 0-23
  dom: CronField // 1-31  (day-of-month)
  month: CronField // 1-12
  dow: CronField // 0-6   (day-of-week, Sun=0)
  domRestricted: boolean
  dowRestricted: boolean
}

/** Parse one cron field: supports `*`, `a`, `a-b`, `a,b`, step `/n`, and combinations. */
function parseField(raw: string, min: number, max: number): CronField {
  const set = new Set<number>()
  for (const part of raw.split(",")) {
    if (part.length === 0) throw new Error(`cron: empty field segment in "${raw}"`)
    let rangePart = part
    let step = 1
    const slash = part.indexOf("/")
    if (slash !== -1) {
      rangePart = part.slice(0, slash)
      step = Number(part.slice(slash + 1))
      if (!Number.isInteger(step) || step <= 0) throw new Error(`cron: bad step in "${part}"`)
    }
    let lo: number
    let hi: number
    if (rangePart === "*") {
      lo = min
      hi = max
    } else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-")
      lo = Number(a)
      hi = Number(b)
    } else {
      lo = Number(rangePart)
      hi = lo
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error(`cron: non-integer in "${part}"`)
    if (lo < min || hi > max || lo > hi) throw new Error(`cron: out-of-range "${part}" (domain ${min}-${max})`)
    for (let v = lo; v <= hi; v += step) set.add(v)
  }
  return set
}

function parseCron(expr: string): ParsedCron {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) throw new Error(`cron: expected 5 fields, got ${fields.length} in "${expr}"`)
  const [min, hr, dom, mon, dow] = fields
  return {
    minute: parseField(min, 0, 59),
    hour: parseField(hr, 0, 23),
    dom: parseField(dom, 1, 31),
    month: parseField(mon, 1, 12),
    // Accept both 0 and 7 for Sunday; normalize 7→0.
    dow: normalizeDow(parseField(dow.replace(/7/g, "0"), 0, 6)),
    domRestricted: dom.trim() !== "*",
    dowRestricted: dow.trim() !== "*",
  }
}

function normalizeDow(set: CronField): CronField {
  if (set.has(7)) {
    set.delete(7)
    set.add(0)
  }
  return set
}

/** ET-agnostic projection of an instant into an arbitrary IANA tz. */
function tzPartsOf(d: Date, tz: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d)
  const get = (t: string): number => {
    const v = parts.find((p) => p.type === t)?.value
    return v === undefined ? Number.NaN : Number(v)
  }
  let hour = get("hour")
  if (hour === 24) hour = 0
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute") }
}

/** Day-of-week (0=Sun) for a calendar date. */
function dowOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/**
 * Next minute strictly after `from` that matches `expr`, evaluated in `tz`.
 *
 * Implementation: iterate minute-by-minute from `from + 1min`, project each
 * candidate into `tz`, and test the cron fields. Bound: 366 days (covers a full
 * year incl. leap day; if nothing matches within that window the expression is
 * effectively unsatisfiable and we throw). Minute-stepping (rather than computing
 * the next match arithmetically) keeps the parser trivially correct across DST
 * transitions and month/year boundaries, since we always test the *local*
 * projection of a concrete UTC instant.
 *
 * Day-of-month / day-of-week semantics follow Vixie cron: if BOTH fields are
 * restricted (neither is `*`), a day matches when EITHER matches; if only one is
 * restricted, only that one constrains the day.
 */
function nextCron(expr: string, from: Date, tz: string): Date {
  const cron = parseCron(expr)
  const startMs = Math.floor(from.getTime() / 60_000) * 60_000 + 60_000 // next whole minute
  const MAX_MINUTES = 366 * 24 * 60
  for (let i = 0; i < MAX_MINUTES; i++) {
    const candidate = new Date(startMs + i * 60_000)
    const p = tzPartsOf(candidate, tz)
    if (!cron.month.has(p.month)) continue
    if (!cron.hour.has(p.hour)) continue
    if (!cron.minute.has(p.minute)) continue
    const wd = dowOf(p.year, p.month, p.day)
    const domOk = cron.dom.has(p.day)
    const dowOk = cron.dow.has(wd)
    let dayOk: boolean
    if (cron.domRestricted && cron.dowRestricted) dayOk = domOk || dowOk
    else if (cron.domRestricted) dayOk = domOk
    else if (cron.dowRestricted) dayOk = dowOk
    else dayOk = true // both `*`
    if (!dayOk) continue
    return candidate
  }
  throw new Error(`cron: no match for "${expr}" within 366 days of ${from.toISOString()}`)
}
