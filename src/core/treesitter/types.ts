/** Languages the engine can parse. Extend the GRAMMARS map in grammars.ts to add more. */
export type Lang = "bash" | "powershell" | "python"

/** A source location, byte- and row/col-addressed, with the matched text. Pure data. */
export interface Span {
  byteStart: number
  byteEnd: number
  startRow: number
  startCol: number
  endRow: number
  endCol: number
  text: string
}

/** One named capture from a query. */
export interface Capture {
  name: string
  span: Span
  // biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter node type is not depended upon
  node: any
}

/** One query match: the set of captures that satisfied a single pattern. */
export interface QMatch {
  captures: Capture[]
}
