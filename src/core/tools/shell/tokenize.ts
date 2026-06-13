/** Split a shell command into sub-command token arrays. Operator- and quote-aware (best-effort, sync). */
export function tokenizeCommands(command: string): string[][] {
  const out: string[][] = []
  let seg: string[] = []
  let tok = ""
  let tokStarted = false
  let quote: '"' | "'" | null = null

  const endTok = () => {
    if (tokStarted) seg.push(tok)
    tok = ""
    tokStarted = false
  }
  const endSeg = () => {
    endTok()
    if (seg.length) out.push(seg)
    seg = []
  }

  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    const next = command[i + 1]
    if (quote) {
      if (c === quote) quote = null
      else {
        tok += c
        tokStarted = true
      }
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      tokStarted = true
      continue
    }
    if (c === " " || c === "\t") {
      endTok()
      continue
    }
    if (c === "\n" || c === ";") {
      endSeg()
      continue
    }
    if ((c === "&" && next === "&") || (c === "|" && next === "|")) {
      endSeg()
      i++
      continue
    }
    if (c === "|") {
      endSeg()
      continue
    }
    // A single & (background), $(...) command substitution, or backtick introduces a NEW command
    // that must be permission-checked on its own — never let it hide inside the preceding segment.
    if (c === "&" && next !== "&") {
      endSeg()
      continue
    }
    if (c === "$" && next === "(") {
      endSeg()
      i++ // skip the '('
      continue
    }
    if (c === "`") {
      endSeg()
      continue
    }
    tok += c
    tokStarted = true
  }
  endSeg()
  return out
}
