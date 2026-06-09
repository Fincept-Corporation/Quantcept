import type { DiagramEdge, DiagramNode, DiagramSpec, DiagramType, EdgeDirection } from "./types"

/**
 * Thrown when DSL is malformed. Carries the 1-based source line when known so
 * the renderer can point the model/user at the offending line. Never escapes
 * the engine: `renderDiagram` catches it and draws a readable error box.
 */
export class DiagramError extends Error {
  readonly line?: number
  constructor(message: string, line?: number) {
    super(message)
    this.name = "DiagramError"
    this.line = line
  }
}

const DIAGRAM_TYPES: readonly DiagramType[] = ["flow", "stack", "tree", "taccount"]
const DIRECTIVE_KEYS = ["type", "title", "direction", "left", "right"] as const
// Multi-char operators are matched before their substrings (`<->` before `<-`/`->`,
// and the bare tree `>` last) so the longest operator on a line always wins.
const EDGE_OPS: { op: string; dir: EdgeDirection }[] = [
  { op: "<->", dir: "<->" },
  { op: "->", dir: "->" },
  { op: "<-", dir: "<-" },
  { op: "--", dir: "--" },
  { op: ">", dir: "->" },
]

// `note: text` or bare `note text` → a caption beneath the diagram.
const NOTE_LINE = /^note[:\s]\s*(.+)$/i

function matchDirective(line: string): { key: (typeof DIRECTIVE_KEYS)[number]; value: string } | null {
  const m = /^([a-z]+)\s*:\s*(.*)$/u.exec(line)
  if (!m) return null
  const key = m[1]! as (typeof DIRECTIVE_KEYS)[number]
  if (!DIRECTIVE_KEYS.includes(key)) return null
  return { key, value: m[2]!.trim() }
}

function matchEdge(line: string): DiagramEdge | null {
  for (const { op, dir } of EDGE_OPS) {
    const idx = line.indexOf(op)
    if (idx === -1) continue
    const from = line.slice(0, idx).trim()
    let rest = line.slice(idx + op.length).trim()
    let label: string | undefined
    const ci = rest.indexOf(":")
    if (ci !== -1) {
      label = rest.slice(ci + 1).trim() || undefined
      rest = rest.slice(0, ci).trim()
    }
    if (!from || !rest) return null
    return label === undefined ? { from, to: rest, dir } : { from, to: rest, dir, label }
  }
  return null
}

function splitValue(s: string): { label: string; value?: string } {
  const i = s.indexOf("|")
  if (i === -1) return { label: s.trim() }
  return { label: s.slice(0, i).trim(), value: s.slice(i + 1).trim() || undefined }
}

/** Parse Quantcept diagram DSL into a {@link DiagramSpec}. Throws {@link DiagramError}. */
export function parseDiagram(src: string): DiagramSpec {
  const lines = src.split(/\r?\n/)
  let type: DiagramType | undefined
  let title: string | undefined
  let direction: "lr" | "tb" | undefined
  const nodes: DiagramNode[] = []
  const edges: DiagramEdge[] = []
  const notes: string[] = []
  let autoId = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    const lineNo = i + 1
    if (line === "" || line.startsWith("#")) continue

    const directive = matchDirective(line)
    if (directive) {
      switch (directive.key) {
        case "type":
          if (!DIAGRAM_TYPES.includes(directive.value as DiagramType))
            throw new DiagramError(
              `unknown diagram type "${directive.value}" (expected flow|stack|tree|taccount)`,
              lineNo,
            )
          type = directive.value as DiagramType
          break
        case "title":
          title = directive.value
          break
        case "direction":
          if (directive.value !== "lr" && directive.value !== "tb")
            throw new DiagramError("direction must be lr or tb", lineNo)
          direction = directive.value
          break
        case "left":
        case "right": {
          const { label, value } = splitValue(directive.value)
          nodes.push({ id: `_${autoId++}`, label, side: directive.key, value })
          break
        }
      }
      continue
    }

    if (line.startsWith("[")) {
      const m = /^\[([^\]]+)\]\s*(.*)$/u.exec(line)
      if (!m) throw new DiagramError("malformed node (expected `[id] label`)", lineNo)
      const id = m[1]!.trim()
      nodes.push({ id, label: m[2]!.trim() || id })
      continue
    }

    const edge = matchEdge(line)
    if (edge) {
      edges.push(edge)
      continue
    }

    const noteMatch = NOTE_LINE.exec(line)
    if (noteMatch) {
      notes.push(noteMatch[1]!.trim())
      continue
    }

    // Lenient by design: an unrecognized line is skipped, not fatal. A single
    // stray line the model invents must never blow away the whole diagram.
  }

  if (!type) throw new DiagramError("missing `type:` directive")
  return { type, title, direction: direction ?? "tb", nodes, edges, notes }
}
