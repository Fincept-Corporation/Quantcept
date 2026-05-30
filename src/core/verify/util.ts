import type { JobTurn } from "@core/jobs/types"
import type { ContentBlock } from "@core/llm/types"

/** Result shape shared by the deterministic / grounded criterion checks. */
export interface CheckResult {
  ok: boolean
  detail: string
}

/** Navigate a dot-separated path (e.g. "valuation.pe") into a parsed JSON value.
 *  Returns `undefined` if any segment is absent or a non-object is traversed. */
export function navigate(root: unknown, pointer: string): unknown {
  const segments = pointer.split(".").filter((s) => s.length > 0)
  let cur: unknown = root
  for (const seg of segments) {
    if (cur === null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

/** Coerce a value to a finite number, or `undefined`. Accepts numbers and numeric strings. */
export function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed === "") return undefined
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/** All `tool_result` content blocks across one turn's messages. */
export function toolResultsOf(turn: JobTurn): Extract<ContentBlock, { type: "tool_result" }>[] {
  const out: Extract<ContentBlock, { type: "tool_result" }>[] = []
  for (const msg of turn.messages) {
    if (typeof msg.content === "string") continue
    for (const block of msg.content) {
      if (block.type === "tool_result") out.push(block)
    }
  }
  return out
}

/** Stringify a tool output for substring grounding (objects → JSON, primitives → String). */
export function stringifyOutput(output: unknown): string {
  if (typeof output === "string") return output
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}
