/**
 * Split assistant content into ordered markdown / diagram segments.
 *
 * The agent emits diagrams inline as a fenced ```` ```qdiagram ```` block. Rather
 * than hook OpenTUI's internal markdown parser, we slice the raw content here and
 * let the TUI render markdown spans through the normal path and diagram spans
 * through {@link DiagramBlock}. An unterminated fence (still streaming) yields a
 * diagram segment with `closed: false` so the renderer can show a placeholder
 * until the closing fence arrives. Ordinary code fences (```` ```python ````) are
 * untouched and stay inside the markdown.
 *
 * `streamEnded` is the key to not getting stuck on the placeholder: when the turn
 * has finished (no more tokens coming) an unterminated trailing fence is treated
 * as closed and rendered, since some models end a turn without a closing ```.
 */
export type DiagramSegment = { kind: "md"; text: string } | { kind: "diagram"; body: string; closed: boolean }

export interface SplitOptions {
  /** True once the assistant turn is complete; closes a dangling fence so it renders. */
  streamEnded?: boolean
}

const OPEN_FENCE = /^\s*```qdiagram\s*$/
const CLOSE_FENCE = /^\s*```\s*$/

export function splitDiagramSegments(content: string, opts: SplitOptions = {}): DiagramSegment[] {
  const lines = content.split("\n")
  const segments: DiagramSegment[] = []
  let md: string[] = []
  let body: string[] | null = null

  const flushMd = (): void => {
    const text = md.join("\n")
    if (text.trim() !== "") segments.push({ kind: "md", text })
    md = []
  }

  for (const line of lines) {
    if (body === null) {
      if (OPEN_FENCE.test(line)) {
        flushMd()
        body = []
      } else {
        md.push(line)
      }
    } else if (CLOSE_FENCE.test(line)) {
      segments.push({ kind: "diagram", body: body.join("\n").trim(), closed: true })
      body = null
    } else {
      body.push(line)
    }
  }

  if (body !== null) segments.push({ kind: "diagram", body: body.join("\n").trim(), closed: opts.streamEnded === true })
  else flushMd()

  return segments
}
