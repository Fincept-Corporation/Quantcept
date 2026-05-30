import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Job, JobTurn } from "@core/jobs/types"
import type { Criterion } from "./types"
import { asFiniteNumber, type CheckResult, navigate, stringifyOutput, toolResultsOf } from "./util"

// ---------------------------------------------------------------------------
// Tier 0 — pure, deterministic checks. No LLM, no network.
// ---------------------------------------------------------------------------

/** A file exists at job.cwd/<path>. */
export function artifactExists(job: Job, c: Extract<Criterion, { kind: "artifactExists" }>): CheckResult {
  const full = resolve(job.cwd, c.path)
  const ok = existsSync(full)
  return { ok, detail: ok ? `artifact present: ${c.path}` : `artifact missing: ${c.path}` }
}

/** A JSON file at <path>, navigated by dot-`pointer`, yields a finite number within [min, max]. */
export function numericInRange(job: Job, c: Extract<Criterion, { kind: "numericInRange" }>): CheckResult {
  const full = resolve(job.cwd, c.path)
  if (!existsSync(full)) return { ok: false, detail: `JSON file missing: ${c.path}` }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(full, "utf8"))
  } catch {
    return { ok: false, detail: `invalid JSON: ${c.path}` }
  }
  const value = navigate(parsed, c.pointer)
  if (value === undefined) return { ok: false, detail: `pointer not found: ${c.pointer} in ${c.path}` }
  const n = asFiniteNumber(value)
  if (n === undefined) return { ok: false, detail: `value at ${c.pointer} is not a number` }
  const ok = n >= c.min && n <= c.max
  return {
    ok,
    detail: ok ? `${c.pointer}=${n} within [${c.min}, ${c.max}]` : `${c.pointer}=${n} outside [${c.min}, ${c.max}]`,
  }
}

// ---------------------------------------------------------------------------
// citationsGrounded
// ---------------------------------------------------------------------------

const NUMBER_RE = /-?\d[\d,]*\.?\d+|-?\d+/g

/** Normalize a numeric token: strip thousands separators. */
function normalizeNumber(raw: string): string {
  return raw.replace(/,/g, "")
}

/**
 * Trivial numbers we ignore to reduce false negatives — these are almost never
 * "claims" that need a tool-result citation:
 *   - small integers 0–4 (counts like "the top 3 names", "2 segments")
 *   - 4-digit years 1900–2100
 * Everything else (prices, ratios, large counts, decimals) must be grounded.
 */
function isTrivial(normalized: string): boolean {
  if (!/^-?\d+$/.test(normalized)) return false // has a decimal point → not trivial
  const n = Number(normalized)
  if (Number.isInteger(n) && n >= 0 && n <= 4) return true
  if (Number.isInteger(n) && n >= 1900 && n <= 2100) return true
  return false
}

/** Extract the set of normalized numeric tokens found in an arbitrary text blob. */
function numberSet(text: string): Set<string> {
  const set = new Set<string>()
  for (const m of text.matchAll(NUMBER_RE)) set.add(normalizeNumber(m[0]))
  return set
}

/**
 * Every non-trivial number appearing in the LAST turn's final text must also appear
 * in some tool_result output from that turn. Matching is token-vs-token-set on the
 * normalized numeric string (boundary-aware), so a fabricated `8.5` is NOT grounded
 * merely because `18.5` exists in a tool output.
 */
export function citationsGrounded(turns: JobTurn[]): { ok: boolean; detail: string; ungrounded: string[] } {
  const last = turns.at(-1)
  if (!last) return { ok: true, detail: "no turns to check", ungrounded: [] }

  const outputText = toolResultsOf(last)
    .map((b) => stringifyOutput(b.output))
    .join(" ")
  const grounded = numberSet(outputText)

  const ungrounded: string[] = []
  const seen = new Set<string>()
  for (const m of last.text.matchAll(NUMBER_RE)) {
    const norm = normalizeNumber(m[0])
    if (seen.has(norm)) continue
    seen.add(norm)
    if (isTrivial(norm)) continue
    if (!grounded.has(norm)) ungrounded.push(norm)
  }

  const ok = ungrounded.length === 0
  return {
    ok,
    detail: ok ? "all cited numbers grounded in tool output" : `ungrounded numbers: ${ungrounded.join(", ")}`,
    ungrounded,
  }
}
