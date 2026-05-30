import type { DiagramSpec } from "../types"
import { withTitle } from "./shared"

/** Indented hierarchy (DCF, fund/corp structure). `from > to` reads parent → child. */
export function treeLayout(spec: DiagramSpec): string {
  const labelOf = new Map(spec.nodes.map((n) => [n.id, n.label]))
  const children = new Map<string, string[]>()
  const childIds = new Set<string>()
  const order: string[] = []
  const seen = new Set<string>()
  const see = (id: string): void => {
    if (!seen.has(id)) {
      seen.add(id)
      order.push(id)
    }
  }

  for (const n of spec.nodes) see(n.id)
  for (const e of spec.edges) {
    see(e.from)
    see(e.to)
    const siblings = children.get(e.from)
    if (siblings) siblings.push(e.to)
    else children.set(e.from, [e.to])
    childIds.add(e.to)
  }

  const roots = order.filter((id) => !childIds.has(id))
  const rootsToUse = roots.length > 0 ? roots : order.slice(0, 1)
  if (rootsToUse.length === 0) return withTitle(spec.title, [])

  const lines: string[] = []
  const onPath = new Set<string>()
  const walk = (id: string, prefix: string, isLast: boolean, isRoot: boolean): void => {
    const branch = isRoot ? "" : isLast ? "└─ " : "├─ "
    lines.push(prefix + branch + (labelOf.get(id) ?? id))
    onPath.add(id)
    const kids = children.get(id) ?? []
    const childPrefix = isRoot ? "" : prefix + (isLast ? "   " : "│  ")
    kids.forEach((k, i) => {
      const last = i === kids.length - 1
      if (onPath.has(k)) {
        // Cycle: print the back-reference once, do not recurse.
        lines.push(`${childPrefix}${last ? "└─ " : "├─ "}${labelOf.get(k) ?? k} (↻)`)
      } else {
        walk(k, childPrefix, last, false)
      }
    })
    onPath.delete(id)
  }

  rootsToUse.forEach((r, i) => {
    walk(r, "", i === rootsToUse.length - 1, true)
  })
  return withTitle(spec.title, lines)
}
