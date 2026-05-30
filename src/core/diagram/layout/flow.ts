import { Canvas } from "../canvas"
import type { DiagramEdge, DiagramSpec } from "../types"
import { center, edgeBetween, withTitle, wrapLabel } from "./shared"

/** Max label width inside a flow box before it wraps to a new line. */
const WRAP = 24

type Orient = "fwd" | "rev" | "both" | "none"

/** Resolve an edge to a direction relative to a layout where `a` precedes `b`. */
function orient(edge: DiagramEdge, a: string, b: string): Orient {
  const forward = edge.from === a && edge.to === b
  switch (edge.dir) {
    case "->":
      return forward ? "fwd" : "rev"
    case "<-":
      return forward ? "rev" : "fwd"
    case "<->":
      return "both"
    default:
      return "none"
  }
}

/** Vertical flow: modular boxes stacked top-to-bottom, joined by labeled arrow
 *  connectors. Long labels wrap so every box stays the same tidy width. */
function flowTB(spec: DiagramSpec): string {
  const nodes = spec.nodes
  if (nodes.length === 0) return ""
  const wrapped = nodes.map((n) => wrapLabel(n.label, WRAP))
  const inner = Math.max(...wrapped.flat().map((l) => l.length))
  const boxW = inner + 4
  const top = `┌${"─".repeat(boxW - 2)}┐`
  const bot = `└${"─".repeat(boxW - 2)}┘`
  const cx = Math.floor(boxW / 2)
  const pad = " ".repeat(cx)
  const lines: string[] = []

  nodes.forEach((n, i) => {
    if (i > 0) {
      const edge = edgeBetween(spec.edges, nodes[i - 1]!.id, n.id)
      const o = edge ? orient(edge, nodes[i - 1]!.id, n.id) : "fwd"
      lines.push(edge?.label ? `${pad}│  ${edge.label}` : `${pad}│`)
      lines.push(pad + (o === "rev" ? "▲" : o === "none" ? "│" : "▼"))
    }
    lines.push(top)
    for (const wl of wrapped[i]!) lines.push(`│ ${center(wl, inner).padEnd(inner)} │`)
    lines.push(bot)
  })

  return withTitle(spec.title, lines)
}

/** Horizontal flow: boxes left-to-right on a shared row, joined by arrow connectors. */
function flowLR(spec: DiagramSpec): string {
  const nodes = spec.nodes
  if (nodes.length === 0) return ""
  const GAP = 5
  const boxes = nodes.map((n) => ({ id: n.id, label: n.label, w: n.label.length + 4 }))
  const xs: number[] = []
  let x = 0
  for (const b of boxes) {
    xs.push(x)
    x += b.w + GAP
  }
  const totalW = Math.max(0, x - GAP)
  const boxTop = 1
  const midRow = boxTop + 1
  const canvas = new Canvas(totalW, boxTop + 3)

  boxes.forEach((b, i) => {
    canvas.drawBox(xs[i]!, boxTop, b.w, 3)
    canvas.drawText(xs[i]! + 2, midRow, b.label)
  })

  for (let i = 0; i < boxes.length - 1; i++) {
    const gapStart = xs[i]! + boxes[i]!.w
    const gapEnd = xs[i + 1]! - 1
    canvas.hLine(gapStart, midRow, gapEnd - gapStart + 1)
    const edge = edgeBetween(spec.edges, boxes[i]!.id, boxes[i + 1]!.id)
    const o = edge ? orient(edge, boxes[i]!.id, boxes[i + 1]!.id) : "fwd"
    if (o === "fwd" || o === "both") canvas.set(gapEnd, midRow, "▶")
    if (o === "rev" || o === "both") canvas.set(gapStart, midRow, "◀")
    if (edge?.label) canvas.drawText(gapStart, 0, edge.label)
  }

  return withTitle(spec.title, canvas.toString().split("\n"))
}

export function flowLayout(spec: DiagramSpec): string {
  return spec.direction === "lr" ? flowLR(spec) : flowTB(spec)
}
