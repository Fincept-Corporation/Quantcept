import { appendFileSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { ensureDir } from "./paths"

/** Append one record as a JSON line, creating parent dirs lazily. */
export function appendJsonl(file: string, record: unknown): void {
  ensureDir(path.dirname(file))
  appendFileSync(file, `${JSON.stringify(record)}\n`)
}

/** Read all JSON lines, skipping blanks and malformed lines. Missing file → []. */
export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return []
  const out: T[] = []
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      out.push(JSON.parse(trimmed) as T)
    } catch {
      // skip malformed line
    }
  }
  return out
}
