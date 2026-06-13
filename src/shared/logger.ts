type Level = "debug" | "info" | "warn" | "error"

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const threshold: Level = (process.env.QUANTCEPT_LOG_LEVEL as Level) ?? "info"

// While the TUI owns the screen, anything written to stderr bleeds onto the
// rendered output. Raise the floor so only errors escape during that window.
// The floor gates STDERR ONLY — registered sinks (e.g. the durable file log)
// always receive every record down to the global threshold.
let minLevel: Level = threshold

export function setLogFloor(level: Level): void {
  minLevel = level
}

export function resetLogFloor(): void {
  minLevel = threshold
}

export type LogRecord = {
  ts: string
  level: Level
  msg: string
} & Record<string, unknown>

export type LogSink = (record: LogRecord) => void

const sinks: LogSink[] = []

/** Register a durable destination for log records. Returns a remover. */
export function addLogSink(sink: LogSink): () => void {
  sinks.push(sink)
  return () => {
    const i = sinks.indexOf(sink)
    if (i >= 0) sinks.splice(i, 1)
  }
}

// Correlation fields merged into every record (e.g. sessionId, projectHash) so
// lines from one run can be grouped. Per-call meta overrides these on conflict.
let context: Record<string, unknown> = {}

export function setLogContext(fields: Record<string, unknown>): void {
  context = { ...context, ...fields }
}

export function clearLogContext(): void {
  context = {}
}

// --- Redaction: never let credentials reach the screen or disk. ---
// Key names whose values are secrets regardless of shape.
const SENSITIVE_KEY = /^(authorization|password|secret|token|api[_-]?key|llm_api_key)$/i
// Token shapes that may appear embedded in otherwise-innocuous strings.
const FINCEPT_TOKEN = /fk_user_[A-Za-z0-9._-]+/g
const SK_KEY = /sk-[A-Za-z0-9._-]{8,}/g

function redactString(s: string): string {
  return s.replace(FINCEPT_TOKEN, "fk_user_***").replace(SK_KEY, "sk-***")
}

function redactValue(key: string | undefined, val: unknown): unknown {
  if (typeof val === "string") {
    if (key && SENSITIVE_KEY.test(key)) return "***"
    return redactString(val)
  }
  if (Array.isArray(val)) return val.map((v) => redactValue(key, v))
  if (val && typeof val === "object") return redactRecord(val as Record<string, unknown>)
  return val
}

function redactRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) out[k] = redactValue(k, v)
  return out
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (order[level] < order[threshold]) return

  const safeMsg = redactString(msg)
  const merged = { ...context, ...meta }
  const safeMeta = Object.keys(merged).length > 0 ? redactRecord(merged) : undefined
  const record: LogRecord = { ...safeMeta, ts: new Date().toISOString(), level, msg: safeMsg }

  // Durable sinks always capture, independent of the screen floor. A failing
  // sink must never break the app.
  for (const sink of sinks) {
    try {
      sink(record)
    } catch {
      // swallow — logging is best-effort
    }
  }

  // Screen output respects the floor so it doesn't bleed onto the TUI.
  if (order[level] >= order[minLevel]) {
    const line = safeMeta ? `${safeMsg} ${JSON.stringify(safeMeta)}` : safeMsg
    process.stderr.write(`[${level}] ${line}\n`)
  }
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => emit("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
}

function describeError(value: unknown): { error: string; stack?: string } {
  if (value instanceof Error) return { error: value.message, stack: value.stack }
  const e = value as { message?: string; stack?: string } | null
  if (e && typeof e.message === "string") return { error: e.message, stack: e.stack }
  return { error: String(value) }
}

let onUncaught: ((err: unknown) => void) | undefined
let onRejection: ((reason: unknown) => void) | undefined

function removeCrashHandlers(): void {
  if (onUncaught) process.off("uncaughtExceptionMonitor", onUncaught)
  if (onRejection) process.off("unhandledRejection", onRejection)
  onUncaught = undefined
  onRejection = undefined
}

/**
 * Capture process-level crashes into the durable log before the process dies.
 * Idempotent; returns a remover.
 *
 * Uses `uncaughtExceptionMonitor` (not `uncaughtException`) so logging does NOT
 * suppress Node's default crash behavior — the stack still prints and the
 * process still exits. Unhandled rejections are logged best-effort.
 */
export function installCrashHandlers(): () => void {
  if (onUncaught) return removeCrashHandlers
  onUncaught = (err: unknown) => logger.error("uncaught exception", describeError(err))
  onRejection = (reason: unknown) => logger.error("unhandled rejection", describeError(reason))
  process.on("uncaughtExceptionMonitor", onUncaught)
  process.on("unhandledRejection", onRejection)
  return removeCrashHandlers
}
