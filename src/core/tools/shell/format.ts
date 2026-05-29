import type { CommandPart } from "./parse"

/** Build the approval dialog message: a labeled per-sub-command breakdown. */
export function formatApproval(parts: CommandPart[]): string {
  if (parts.length === 0) return "Run this command?"
  const lines = parts.map((p) => {
    const glyph = p.risky ? "⚠" : "⊙"
    return p.label ? `  ${glyph} ${p.name} — ${p.label}` : `  ${glyph} ${p.name}`
  })
  return `This will run:\n${lines.join("\n")}`
}
