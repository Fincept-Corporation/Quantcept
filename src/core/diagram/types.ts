/** The four concept-diagram archetypes shipped in Phase 1. */
export type DiagramType = "flow" | "stack" | "tree" | "taccount"

/** Edge direction in a `flow` diagram. Tree `>` is normalized to `->`. */
export type EdgeDirection = "->" | "<-" | "<->" | "--"

export interface DiagramNode {
  id: string
  label: string
  /** `taccount` only: which ledger column this row sits in. */
  side?: "left" | "right"
  /** `taccount` only: the amount drawn right-aligned in the column. */
  value?: string
}

export interface DiagramEdge {
  from: string
  to: string
  dir: EdgeDirection
  label?: string
}

export interface DiagramSpec {
  type: DiagramType
  title?: string
  direction: "lr" | "tb"
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  /** Free-text captions rendered beneath the diagram (from `note` lines). */
  notes: string[]
}

/** The portable text artifact the engine produces. `text` is the rendered grid. */
export interface DiagramArtifact {
  text: string
  type?: DiagramType
  title?: string
  isError: boolean
}
