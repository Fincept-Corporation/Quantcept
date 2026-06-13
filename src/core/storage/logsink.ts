import { addLogSink, type LogRecord } from "@shared/logger"
import { appendJsonl } from "./jsonl"
import { logFile } from "./paths"

/**
 * Install the durable file sink: every log record is appended as a JSON line to
 * a date-stamped file under `~/.quantcept/logs`. Returns a remover.
 *
 * Best-effort by construction — `logger.emit` already guards sink calls, so a
 * write failure (read-only disk, etc.) is swallowed and never breaks the app.
 */
export function installFileLogSink(): () => void {
  return addLogSink((record: LogRecord) => {
    const stamp = record.ts.slice(0, 10) // YYYY-MM-DD from the ISO timestamp
    appendJsonl(logFile(stamp), record)
  })
}
