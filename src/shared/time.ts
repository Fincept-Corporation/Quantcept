const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Human relative time: "just now", "5m ago", "3h ago", "yesterday", "4d ago", else "3 Jun". */
export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const sec = Math.floor((now - ts) / 1000)
  if (sec < 45) return "just now"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return "yesterday"
  if (day < 7) return `${day}d ago`
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
