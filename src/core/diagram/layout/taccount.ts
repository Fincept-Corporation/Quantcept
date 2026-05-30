import type { DiagramNode, DiagramSpec } from "../types"
import { withTitle } from "./shared"

/** Natural cell width: "label  value" or just "label". */
function natural(n: DiagramNode): number {
  return n.value ? n.label.length + 2 + n.value.length : n.label.length
}

/** Format a cell to a fixed width with the value right-aligned. */
function fmt(n: DiagramNode | undefined, width: number): string {
  if (!n) return " ".repeat(width)
  if (!n.value) return n.label.padEnd(width)
  const gap = Math.max(1, width - n.label.length - n.value.length)
  return (n.label + " ".repeat(gap) + n.value).padEnd(width)
}

/** Two-column ledger (balance sheet, double-entry). `left:`/`right:` rows fill each side. */
export function taccountLayout(spec: DiagramSpec): string {
  const left = spec.nodes.filter((n) => n.side === "left")
  const right = spec.nodes.filter((n) => n.side === "right")
  const rows = Math.max(left.length, right.length)
  if (rows === 0) return withTitle(spec.title, [])

  const lw = Math.max(1, ...left.map(natural))
  const rw = Math.max(1, ...right.map(natural))
  const top = `┌${"─".repeat(lw + 2)}┬${"─".repeat(rw + 2)}┐`
  const bot = `└${"─".repeat(lw + 2)}┴${"─".repeat(rw + 2)}┘`
  const lines = [top]
  for (let i = 0; i < rows; i++) {
    lines.push(`│ ${fmt(left[i], lw)} │ ${fmt(right[i], rw)} │`)
  }
  lines.push(bot)
  return withTitle(spec.title, lines)
}
