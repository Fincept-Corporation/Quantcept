import { describe, expect, test } from "bun:test"
import type { Job } from "@core/jobs/types"
import { formatJobRow, formatNextRun, statusColor, truncateGoal } from "@tui/components/jobs-view-format"

describe("truncateGoal", () => {
  test("returns short strings unchanged", () => {
    expect(truncateGoal("short goal")).toBe("short goal")
  })
  test("collapses internal whitespace and trims", () => {
    expect(truncateGoal("  a\t b\n  c  ")).toBe("a b c")
  })
  test("truncates with an ellipsis when over the limit", () => {
    const long = "x".repeat(60)
    const out = truncateGoal(long)
    expect(out.length).toBe(48)
    expect(out.endsWith("…")).toBe(true)
  })
  test("respects a custom limit", () => {
    expect(truncateGoal("abcdef", 4)).toBe("abc…")
  })
})

describe("formatNextRun", () => {
  const now = 1_000_000_000_000
  test("undefined → em dash", () => {
    expect(formatNextRun(undefined, now)).toBe("—")
  })
  test("past or now → due", () => {
    expect(formatNextRun(now, now)).toBe("due")
    expect(formatNextRun(now - 60_000, now)).toBe("due")
  })
  test("30 minutes out → in 30m", () => {
    expect(formatNextRun(now + 30 * 60_000, now)).toBe("in 30m")
  })
  test("120 minutes out → in 2h", () => {
    expect(formatNextRun(now + 120 * 60_000, now)).toBe("in 2h")
  })
  test("2880 minutes out → in 2d", () => {
    expect(formatNextRun(now + 2880 * 60_000, now)).toBe("in 2d")
  })
})

describe("statusColor", () => {
  test("maps each known status", () => {
    expect(statusColor("done")).toBe("#22c55e")
    expect(statusColor("running")).toBe("#3b82f6")
    expect(statusColor("paused")).toBe("#eab308")
    expect(statusColor("failed")).toBe("#ef4444")
  })
  test("falls back to pending color for unknown/pending", () => {
    expect(statusColor("pending")).toBe("#9ca3af")
    expect(statusColor("anything-else")).toBe("#9ca3af")
  })
})

describe("formatJobRow", () => {
  const now = 1_000_000_000_000
  const base: Job = {
    id: "job-1",
    projectHash: "abcd1234",
    cwd: "/tmp/x",
    goal: "  do   the    thing  ",
    status: "running",
    maxTurns: 20,
    turnsUsed: 3,
    readOnly: true,
    createdAt: now,
    updatedAt: now,
  }

  test("produces the row-view shape", () => {
    const row = formatJobRow(base, now)
    expect(row).toEqual({
      id: "job-1",
      status: "running",
      turns: "3/20",
      next: "—",
      goal: "do the thing",
    })
  })

  test("appends pauseReason to status when paused", () => {
    const row = formatJobRow({ ...base, status: "paused", pauseReason: "needs-human" }, now)
    expect(row.status).toBe("paused:needs-human")
  })

  test("formats nextRunAt into the next column", () => {
    const row = formatJobRow({ ...base, nextRunAt: now + 90 * 60_000 }, now)
    expect(row.next).toBe("in 2h")
  })
})
