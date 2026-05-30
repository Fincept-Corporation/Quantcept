/**
 * Condense a tool's result into a short one-line label for the tool row, so the
 * full payload (e.g. a ticker's JSON) never floods the chat. A tool's own
 * `title` is preferred when set; this is the fallback for tools that don't.
 */
export function summarizeToolOutput(output: unknown, isError?: boolean): string {
  if (isError) return typeof output === "string" ? oneLine(output) : "error"
  if (output === null || output === undefined || output === "") return "done"
  if (typeof output === "string") return oneLine(output)
  if (Array.isArray(output)) return `${output.length} item${output.length === 1 ? "" : "s"}`
  if (typeof output === "object") {
    const o = output as Record<string, unknown>
    const name = firstString(o.longName, o.name, o.title, o.symbol)
    if (name) {
      const sym = typeof o.symbol === "string" ? o.symbol : undefined
      return oneLine(sym && sym !== name ? `${name} (${sym})` : name)
    }
    const n = Object.keys(o).length
    return `${n} field${n === 1 ? "" : "s"}`
  }
  return oneLine(String(output))
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v
  return undefined
}

function oneLine(s: string, max = 56): string {
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
