/**
 * Schedule kinds for the finance-aware scheduler.
 *
 * `marketRelative` is the finance-specific one: it anchors a run to an exchange
 * session boundary (open/close) rather than a wall-clock time, so "5 minutes
 * before the close" stays correct across holidays, half-days, and DST.
 */
export type Schedule =
  | { kind: "once"; at: number } // epoch ms
  | { kind: "interval"; everyMinutes: number }
  | { kind: "cron"; expr: string; tz?: string } // 5-field cron; tz IANA (default UTC)
  | {
      kind: "marketRelative"
      exchange: "XNYS"
      anchor: "open" | "close"
      offsetMinutes: number
    }

/**
 * What to do when a scheduled run was missed (e.g. the process was down across
 * the scheduled instant):
 * - `catch_up`: run it now anyway.
 * - `skip`: drop the missed occurrence and wait for the next one.
 */
export type MissedPolicy = "catch_up" | "skip"
