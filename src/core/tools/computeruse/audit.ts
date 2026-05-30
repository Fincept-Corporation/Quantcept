/**
 * Append-only audit log for computer-use. Every action is recorded as one tab-separated
 * line (ISO time · action · detail · screenshot path) for after-the-fact review/compliance.
 * Pure formatting; the timestamp is injected so it stays testable.
 */

export interface AuditEntry {
  timestamp: number
  action: string
  coordinate?: [number, number]
  text?: string
  screenshotPath?: string
}

function truncate(s: string, max = 80): string {
  const oneLine = s.replace(/\s+/g, " ").trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

export function formatAuditEntry(e: AuditEntry): string {
  const iso = new Date(e.timestamp).toISOString()
  const detail = e.coordinate
    ? `[${e.coordinate[0]},${e.coordinate[1]}]`
    : e.text !== undefined
      ? truncate(e.text)
      : "-"
  const path = e.screenshotPath ?? "-"
  return `${iso}\t${e.action}\t${detail}\t${path}`
}
