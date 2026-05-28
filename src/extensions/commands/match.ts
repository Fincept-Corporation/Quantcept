import type { Command } from "./types"

export interface MatchResult {
  score: number
}

export function fuzzyMatch(query: string, text: string): MatchResult | null {
  if (query.length === 0) return { score: 0 }
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let score = 0
  let ti = 0
  let prevMatchIdx = -2
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    score += 1
    if (found === prevMatchIdx + 1) score += 3 // contiguous bonus
    if (found === 0 || /[\s\-_:/]/.test(t[found - 1] ?? "")) score += 2 // word-boundary bonus
    prevMatchIdx = found
    ti = found + 1
  }
  score += Math.max(0, 5 - (text.length - query.length) * 0.1) // shorter targets rank higher
  return { score }
}

function bestFieldScore(query: string, command: Command): number | null {
  const fields: Array<[string | undefined, number]> = [
    [command.name, 3],
    [command.id, 2],
    ...(command.aliases ?? []).map((a) => [a, 2] as [string, number]),
    [command.category, 1],
    [command.description, 0.5],
  ]
  let best: number | null = null
  for (const [text, weight] of fields) {
    if (!text) continue
    const m = fuzzyMatch(query, text)
    if (m === null) continue
    const weighted = m.score * (1 + weight)
    if (best === null || weighted > best) best = weighted
  }
  return best
}

export function rankCommands(query: string, commands: readonly Command[]): Command[] {
  if (query.length === 0) return [...commands]
  const scored: Array<{ command: Command; score: number }> = []
  for (const command of commands) {
    const score = bestFieldScore(query, command)
    if (score === null) continue
    scored.push({ command, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.command)
}
