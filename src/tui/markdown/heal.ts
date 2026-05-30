/**
 * Heal partial markdown produced mid-stream so a CommonMark renderer never shows
 * raw, dangling markers (e.g. `**bol` before its closing `**` has streamed in).
 *
 * Pure and provider-agnostic. It only touches the trailing edge: it appends a
 * synthetic closer for an unterminated inline span, or strips a dangling
 * link/image fragment. Balanced (completed) markdown is returned unchanged, so a
 * finished response heals to *itself* — the streaming render is also the final
 * render, with no end-of-turn re-format or visible swap.
 *
 * Deliberate non-goals (chosen to avoid corrupting ordinary text):
 *  - Underscores are never healed — `snake_case`/`file_names` must survive.
 *  - Emphasis is healed only when the trailing marker is "left-flanking"
 *    (immediately followed by a non-space), matching CommonMark, so `2 * 3` and
 *    `* ` (a bullet) are not mistaken for italics.
 *  - Inside an unterminated fenced code block nothing is healed — markers there
 *    are literal, and `marked` already renders an open fence as a code block to
 *    end-of-input.
 */
export function healStreamingMarkdown(text: string): string {
  if (!text?.trim()) return text

  // 1. Inside an unclosed fenced code block: leave everything untouched.
  if (insideOpenFence(text)) return text

  // 2. Drop a trailing dangling link/image fragment (`[t`, `[t](`, `![a](u`…).
  let out = stripDanglingLink(text)

  // 3. Drop a just-opened marker that has no content yet (`Here is **`) or a
  //    half-arrived closer (`~~weak~`) — showing those raw is the worst flicker.
  out = stripTrailingDangling(out)

  // 4. Close an unterminated inline-code span, and mask code so its contents
  //    never skew the emphasis counts below.
  const { masked, suffix: codeSuffix } = closeInlineCode(out)

  // 5. Close dangling emphasis: bold `**`, then italic `*`, then strike `~~`.
  const closers = codeSuffix + trailingEmphasisSuffix(masked)
  if (!closers) return out

  // Insert closers *before* any trailing whitespace: CommonMark will not close
  // emphasis whose closing delimiter is preceded by a space (`**HDFC **`).
  return out.replace(/\s*$/, (ws) => closers + ws)
}

/**
 * Remove a trailing marker that would render as a raw symbol: a just-opened
 * delimiter sitting after whitespace with nothing inside it yet, or a single
 * trailing `~` that is the first half of a `~~` closer. Stripping (rather than
 * closing) avoids an empty span and resolves once the next token streams in.
 */
function stripTrailingDangling(out: string): string {
  return out
    .replace(/(^|[^~])~$/, "$1") // lone trailing `~` (partial strikethrough closer)
    .replace(/(^|\s)(\*\*|\*|`+|~~)$/, "$1") // opener after whitespace, no content yet
}

/** True when the text ends inside an unclosed ``` or ~~~ fenced code block. */
function insideOpenFence(text: string): boolean {
  let fenceChar: string | null = null
  for (const line of text.split("\n")) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line)
    if (!m) continue
    const char = m[1][0]
    if (fenceChar === null) fenceChar = char
    else if (line.trimStart().startsWith(fenceChar.repeat(3))) fenceChar = null
  }
  return fenceChar !== null
}

/** Replace fenced + inline code spans with equal-length blanks (indices preserved). */
function maskCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/~~~[\s\S]*?~~~/g, blank)
    .replace(/(`+)(?:(?!\1)[\s\S])*\1/g, blank)
}

const blank = (m: string): string => " ".repeat(m.length)

/**
 * Strip a trailing link/image that has started but not finished, so the user
 * never sees raw `[label](http…` mid-stream. Returns the text unchanged when the
 * last bracket pair forms a complete link.
 */
function stripDanglingLink(text: string): string {
  const masked = maskCode(text)
  let cut = -1
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] !== "[") continue
    const close = masked.indexOf("]", i)
    if (close === -1) {
      cut = i // no closing bracket yet → dangling from here on
      break
    }
    if (masked[close + 1] === "(") {
      const paren = masked.indexOf(")", close + 1)
      if (paren === -1) {
        cut = i // inline link opened but never closed → dangling
        break
      }
      i = paren // skip a complete [text](url)
    } else {
      i = close // [text] with no url → treat as complete enough; keep scanning
    }
  }
  if (cut === -1) return text
  if (cut > 0 && text[cut - 1] === "!") cut -= 1 // include the image bang
  return text.slice(0, cut)
}

/**
 * Detect an unterminated inline-code span at the tail and return the closer plus
 * a masked copy in which all code (including the open span) is blanked out.
 */
function closeInlineCode(text: string): { masked: string; suffix: string } {
  const masked = maskCode(text)
  const runs = masked.match(/`+/g)
  if (!runs) return { masked, suffix: "" }
  const open = runs[runs.length - 1]
  const idx = masked.lastIndexOf(open)
  const maskedNoOpen = masked.slice(0, idx) + " ".repeat(masked.length - idx)
  return { masked: maskedNoOpen, suffix: open }
}

/** Closers needed for dangling bold/italic/strikethrough at the trailing edge. */
function trailingEmphasisSuffix(masked: string): string {
  let suffix = ""

  if (isOddLeftFlanking(masked, "**")) suffix += "**"

  // Remove balanced/healed `**` and line-start bullets before judging single `*`.
  const forItalic = masked.replace(/\*\*/g, "  ").replace(/^(\s*)\*(\s)/gm, (_m, a, b) => `${a} ${b}`)
  if (isOddLeftFlanking(forItalic, "*")) suffix += "*"

  if (isOddLeftFlanking(masked, "~~")) suffix += "~~"

  return suffix
}

/**
 * True when `marker` appears an odd number of times AND its last occurrence is a
 * valid opening delimiter (immediately followed by a non-space character).
 */
function isOddLeftFlanking(masked: string, marker: string): boolean {
  const matches = masked.match(new RegExp(escapeRegExp(marker), "g"))
  if (!matches || matches.length % 2 === 0) return false
  const after = masked[masked.lastIndexOf(marker) + marker.length]
  return after !== undefined && !/\s/.test(after)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
