// Maps a command "head" to how many leading tokens identify it (for permission patterns).
const ARITY: Record<string, number> = {
  git: 2,
  "git config": 3,
  npm: 2,
  "npm run": 3,
  bun: 2,
  "bun run": 3,
  rm: 1,
  mv: 2,
  cp: 2,
  mkdir: 1,
  cat: 1,
  ls: 1,
}

/** Longest-match: return the leading tokens that identify the command (for a rule pattern). */
export function arityPrefix(tokens: string[]): string[] {
  if (tokens.length === 0) return []
  for (let len = tokens.length; len > 0; len--) {
    const key = tokens.slice(0, len).join(" ")
    const a = ARITY[key]
    if (a !== undefined) return tokens.slice(0, a)
  }
  return tokens.slice(0, 1)
}
