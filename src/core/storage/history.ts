import { writeFileSync } from "node:fs"
import { readJsonl } from "./jsonl"
import { ensureDir, promptHistoryFile, stateDir } from "./paths"

export const HISTORY_CAP = 50

interface HistoryEntry {
  text: string
  ts: number
}

/** All persisted prompts, oldest → newest (text only). */
export function loadHistory(): string[] {
  return readJsonl<HistoryEntry>(promptHistoryFile()).map((e) => e.text)
}

/** Append a prompt (skip consecutive dup), capping the file at HISTORY_CAP. */
export function pushHistory(text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return
  const entries = readJsonl<HistoryEntry>(promptHistoryFile())
  if (entries[entries.length - 1]?.text === trimmed) return
  entries.push({ text: trimmed, ts: Date.now() })
  const capped = entries.slice(-HISTORY_CAP)
  ensureDir(stateDir())
  writeFileSync(promptHistoryFile(), `${capped.map((e) => JSON.stringify(e)).join("\n")}\n`)
}
