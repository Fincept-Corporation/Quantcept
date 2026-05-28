type Level = "debug" | "info" | "warn" | "error"

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const threshold: Level = (process.env.QUANTCEPT_LOG_LEVEL as Level) ?? "info"

// While the TUI owns the screen, anything written to stderr bleeds onto the
// rendered output. Raise the floor so only errors escape during that window.
let minLevel: Level = threshold

export function setLogFloor(level: Level): void {
  minLevel = level
}

export function resetLogFloor(): void {
  minLevel = threshold
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (order[level] < order[threshold]) return
  if (order[level] < order[minLevel]) return
  const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg
  process.stderr.write(`[${level}] ${line}\n`)
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => emit("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
}
