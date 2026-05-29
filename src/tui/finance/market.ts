// Finance helpers shared by the home hero and the chat sidebar.
// Pure and timezone-independent: IST is computed from the UTC epoch directly so
// results don't depend on the host machine's local timezone.

export interface MarketState {
  open: boolean
  label: string
}

const IST_OFFSET_MIN = 5 * 60 + 30 // UTC+5:30
const OPEN_MIN = 9 * 60 + 15 // 09:15 IST
const CLOSE_MIN = 15 * 60 + 30 // 15:30 IST

/**
 * NSE/BSE regular-session status for a given instant (default: now).
 * Open Mon–Fri, 09:15–15:30 IST (close-exclusive). Holidays are not modeled.
 */
export function marketStatus(now: Date = new Date()): MarketState {
  const istMs = now.getTime() + IST_OFFSET_MIN * 60_000
  const ist = new Date(istMs)
  const day = ist.getUTCDay() // 0 = Sun … 6 = Sat (in IST-shifted clock)
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  const weekday = day >= 1 && day <= 5
  const open = weekday && minutes >= OPEN_MIN && minutes < CLOSE_MIN
  return { open, label: open ? "Markets Open" : "Markets Closed" }
}

/** Compact elapsed duration: "45s", "1m 30s", "1h 1m". Clamps negatives to "0s". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
