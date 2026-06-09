import type { Command } from "./types"

export interface MatchResult {
  score: number
}

// fzf-style scoring constants.
const SCORE_MATCH = 16
const BONUS_BOUNDARY = 8 // match at a word boundary (start, after separator, camelCase)
const BONUS_CONSECUTIVE = 8 // match immediately follows the previous match
const BONUS_FIRST_CHAR = 8 // extra weight when the first query char lands well
const PENALTY_GAP_START = 3 // first skipped char in a gap
const PENALTY_GAP_EXTEND = 1 // each subsequent skipped char

const SEP = /[\s\-_:/.]/

function isBoundary(text: string, idx: number): boolean {
  if (idx === 0) return true
  const prev = text[idx - 1] ?? ""
  if (SEP.test(prev)) return true
  // camelCase boundary: lowercase/digit followed by uppercase
  const cur = text[idx] ?? ""
  return /[a-z0-9]/.test(prev) && /[A-Z]/.test(cur)
}

/**
 * fzf-style fuzzy score. Greedily matches the query as a subsequence of `text`,
 * rewarding consecutive runs and word-boundary starts and penalizing gaps.
 * Returns null when `query` is not a subsequence of `text`.
 */
export function fuzzyMatch(query: string, text: string): MatchResult | null {
  if (query.length === 0) return { score: 0 }
  const q = query.toLowerCase()
  const tl = text.toLowerCase()

  let score = 0
  let ti = 0
  let prevMatchIdx = -1
  for (let qi = 0; qi < q.length; qi++) {
    const found = tl.indexOf(q[qi]!, ti)
    if (found === -1) return null

    score += SCORE_MATCH
    if (isBoundary(text, found)) score += qi === 0 ? BONUS_BOUNDARY + BONUS_FIRST_CHAR : BONUS_BOUNDARY
    if (found === prevMatchIdx + 1) score += BONUS_CONSECUTIVE

    if (prevMatchIdx >= 0) {
      const gap = found - prevMatchIdx - 1
      if (gap > 0) score -= PENALTY_GAP_START + (gap - 1) * PENALTY_GAP_EXTEND
    }

    prevMatchIdx = found
    ti = found + 1
  }
  // Prefer shorter targets when scores are otherwise close.
  score += Math.max(0, 5 - (text.length - query.length) * 0.1)
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
  if (best === null) return null

  // Strongly prioritize the obvious hits so a query like "theme" ranks the
  // "theme" command above scattered subsequence matches (flpbalada-theme, …).
  const q = query.toLowerCase()
  const candidates = [command.name, ...(command.aliases ?? [])].map((s) => s.toLowerCase())
  if (candidates.some((c) => c === q)) best += 1000
  else if (candidates.some((c) => c.startsWith(q))) best += 500
  else if (command.name.toLowerCase().includes(q)) best += 100
  return best
}

// Curated category priority for the empty-query view (bare "/" popover and the
// freshly-opened palette). High-value verbs surface first; anything whose
// category isn't listed here sinks below the curated groups.
const CATEGORY_ORDER = [
  "Session",
  "Plugins",
  "Skills",
  "Agents",
  "MCP",
  "Memory",
  "Trading",
  "Jobs",
  "View",
  "Setup",
  "Account",
  "Cloud",
  "Learnings",
  "Buddy",
  "General",
]

function categoryRank(category: string | undefined): number {
  const i = CATEGORY_ORDER.indexOf(category ?? "")
  return i === -1 ? CATEGORY_ORDER.length : i
}

/**
 * Default ordering when there is no query: group by curated category priority,
 * then alphabetical by name within each group. Stable and predictable, so the
 * most useful commands lead the list instead of raw registration order.
 */
function defaultSort(commands: readonly Command[]): Command[] {
  return [...commands].sort((a, b) => {
    const byCategory = categoryRank(a.category) - categoryRank(b.category)
    if (byCategory !== 0) return byCategory
    return a.name.localeCompare(b.name)
  })
}

export function rankCommands(query: string, commands: readonly Command[]): Command[] {
  if (query.length === 0) return defaultSort(commands)
  const scored: Array<{ command: Command; score: number }> = []
  for (const command of commands) {
    const score = bestFieldScore(query, command)
    if (score === null) continue
    scored.push({ command, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.command)
}
