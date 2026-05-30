import type { DiagramSpec } from "../types"
import { withTitle } from "./shared"

/** Equal-width boxes stacked vertically with shared dividers (capital structure, tranches). */
export function stackLayout(spec: DiagramSpec): string {
  const nodes = spec.nodes
  if (nodes.length === 0) return ""
  const inner = Math.max(...nodes.map((n) => n.label.length))
  const w = inner + 2
  const lines = [`┌${"─".repeat(w)}┐`]
  nodes.forEach((n, i) => {
    if (i > 0) lines.push(`├${"─".repeat(w)}┤`)
    lines.push(`│ ${n.label.padEnd(inner)} │`)
  })
  lines.push(`└${"─".repeat(w)}┘`)
  return withTitle(spec.title, lines)
}
