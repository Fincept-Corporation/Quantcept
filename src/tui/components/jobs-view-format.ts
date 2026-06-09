import type { Job } from "@core/jobs/types"
import { ellipsize } from "@shared/format"

export interface JobRowView {
  id: string
  status: string
  turns: string
  next: string
  goal: string
}

export function truncateGoal(s: string, n = 48): string {
  return ellipsize(s, n)
}

/** Human next-run: "—" when unset, else a compact local time. */
export function formatNextRun(nextRunAt: number | undefined, now: number): string {
  if (nextRunAt === undefined) return "—"
  const deltaMin = Math.round((nextRunAt - now) / 60000)
  if (deltaMin <= 0) return "due"
  if (deltaMin < 60) return `in ${deltaMin}m`
  if (deltaMin < 1440) return `in ${Math.round(deltaMin / 60)}h`
  return `in ${Math.round(deltaMin / 1440)}d`
}

/** A hex status color (theme-independent; readable on dark + light). */
export function statusColor(status: string): string {
  switch (status) {
    case "done":
      return "#22c55e"
    case "running":
      return "#3b82f6"
    case "paused":
      return "#eab308"
    case "failed":
      return "#ef4444"
    default:
      return "#9ca3af" // pending
  }
}

export function formatJobRow(job: Job, now: number): JobRowView {
  return {
    id: job.id,
    status: job.status + (job.pauseReason ? `:${job.pauseReason}` : ""),
    turns: `${job.turnsUsed}/${job.maxTurns}`,
    next: formatNextRun(job.nextRunAt, now),
    goal: truncateGoal(job.goal),
  }
}
