type Level = "debug" | "info" | "warn" | "error"

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const threshold: Level = (process.env.QUANTCEPT_LOG_LEVEL as Level) ?? "info"

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (order[level] < order[threshold]) return
  const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg
  process.stderr.write(`[${level}] ${line}\n`)
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => emit("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
}
