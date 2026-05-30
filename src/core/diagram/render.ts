import { flowLayout } from "./layout/flow"
import { errorBox } from "./layout/shared"
import { stackLayout } from "./layout/stack"
import { taccountLayout } from "./layout/taccount"
import { treeLayout } from "./layout/tree"
import { DiagramError, parseDiagram } from "./parse"
import type { DiagramArtifact, DiagramSpec, DiagramType } from "./types"

const LAYOUTS: Record<DiagramType, (spec: DiagramSpec) => string> = {
  flow: flowLayout,
  stack: stackLayout,
  tree: treeLayout,
  taccount: taccountLayout,
}

/** Append `note` captions beneath the rendered diagram, one bulleted line each. */
function appendNotes(body: string, notes: string[]): string {
  if (notes.length === 0) return body
  const caption = notes.map((n) => `• ${n}`).join("\n")
  return body ? `${body}\n${caption}` : caption
}

/**
 * Parse and render a diagram DSL block into a portable text artifact.
 *
 * Total by contract: any failure (parse error, malformed input, anything) is
 * caught and rendered as a small error box with `isError: true`, so a bad
 * diagram never crashes the caller or the TUI.
 */
export function renderDiagram(src: string): DiagramArtifact {
  try {
    const spec = parseDiagram(src)
    const body = appendNotes(LAYOUTS[spec.type](spec), spec.notes)
    return { text: body, type: spec.type, title: spec.title, isError: false }
  } catch (e) {
    const msg =
      e instanceof DiagramError
        ? e.line != null
          ? `line ${e.line}: ${e.message}`
          : e.message
        : e instanceof Error
          ? e.message
          : String(e)
    return { text: errorBox(msg), isError: true }
  }
}
