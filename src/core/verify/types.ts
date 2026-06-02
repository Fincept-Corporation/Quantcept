/**
 * Success specification for the tiered completion verifier.
 *
 * The whole shape MUST be JSON-serializable: it is persisted verbatim in the job
 * row (`Job.successSpec`). Do NOT embed Zod objects, functions, or class instances —
 * only plain data the verifier can re-hydrate later.
 */

/** One checkable completion criterion. Discriminated on `kind`. */
export type Criterion =
  // Tier 0 — pure, no LLM, no network.
  | { kind: "artifactExists"; path: string } // a file exists under job.cwd
  | {
      // a JSON file → dot-path → finite number within [min, max]
      kind: "numericInRange"
      path: string
      pointer: string
      min: number
      max: number
    }
  | { kind: "citationsGrounded" } // every (non-trivial) number in the final text appears in some tool_result output
  // Tier 1 — uses the tool registry; read-only re-call.
  | {
      // re-call `tool`, compare the artifact value at path/pointer against the tool's value
      kind: "groundedValue"
      path: string
      pointer: string
      tool: string
      input: unknown
      tolerancePct: number
    }

export interface SuccessSpec {
  criteria: Criterion[]
  /** Natural-language quality questions for the Tier-2 judge ensemble. */
  fuzzyAspects?: string[]
  /** Fraction of fuzzy aspects that must pass for completion (default 0.67). */
  passThreshold?: number
}

// Re-export the runner's Verdict so the verifier's output type matches the runner dep exactly.
export type { Verdict } from "@core/jobs/runner"
