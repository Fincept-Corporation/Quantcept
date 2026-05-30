import type { Tool } from "./Tool"

/** Reversibility class of a tool's real-world effect. Static, author-declared.
 *  Powers the read-only sandbox now; the authorization gate for trading later. */
export type EffectClass = "read" | "write" | "compensable" | "irreversible"

/** Resolve a tool's effect class: explicit field wins, else derive from isReadOnly. */
export function effectClassOf(tool: Tool, input: unknown): EffectClass {
  if (tool.effectClass) return tool.effectClass
  return tool.isReadOnly(input as never) ? "read" : "write"
}
