import type { DiagramEdge } from "../types"

/** Center `s` within `width` by left-padding (used for titles over a body). */
export function center(s: string, width: number): string {
  if (s.length >= width) return s
  return " ".repeat(Math.floor((width - s.length) / 2)) + s
}

/** Word-wrap a label to at most `maxWidth` columns. A word longer than the limit
 *  is kept whole (we never hard-split a word). Always returns at least one line. */
export function wrapLabel(text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return [""]
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    if (current === "") current = word
    else if (`${current} ${word}`.length <= maxWidth) current = `${current} ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  lines.push(current)
  return lines
}

/** Prepend a centered title above a body, or return the body alone. */
export function withTitle(title: string | undefined, body: string[]): string {
  if (!title) return body.join("\n")
  const width = Math.max(title.length, ...body.map((l) => l.length), 0)
  return [center(title, width), ...body].join("\n")
}

/** Find an edge linking two nodes regardless of declared direction. */
export function edgeBetween(edges: DiagramEdge[], a: string, b: string): DiagramEdge | undefined {
  return edges.find((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))
}

/** A small bordered box used to surface malformed-DSL errors instead of crashing. */
export function errorBox(message: string): string {
  const header = "⚠ diagram error"
  const lines = message.split("\n")
  const w = Math.max(header.length, ...lines.map((l) => l.length))
  const top = `┌${"─".repeat(w + 2)}┐`
  const bot = `└${"─".repeat(w + 2)}┘`
  const out = [top, `│ ${header.padEnd(w)} │`, `├${"─".repeat(w + 2)}┤`]
  for (const l of lines) out.push(`│ ${l.padEnd(w)} │`)
  out.push(bot)
  return out.join("\n")
}
