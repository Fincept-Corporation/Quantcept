import type { Job, JobTurn } from "@core/jobs/types"
import type { Provider } from "@core/llm/types"
import type { ToolRegistry } from "@core/tools/registry"
import { artifactExists, citationsGrounded, numericInRange } from "./deterministic"
import { groundedValue } from "./grounded"
import { judgeAspects } from "./judge"
import type { Criterion, SuccessSpec, Verdict } from "./types"
import type { CheckResult } from "./util"

export interface VerifierDeps {
  registry?: ToolRegistry
  judge?: Provider
  /** Optional system prompt override for the Tier-2 judge. */
  system?: string
}

const DEFAULT_PASS_THRESHOLD = 0.67

/** Best-effort hydration of the persisted spec. Returns undefined when there is nothing to check. */
function parseSpec(raw: unknown): SuccessSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const spec = raw as SuccessSpec
  if (!Array.isArray(spec.criteria) || spec.criteria.length === 0) return undefined
  return spec
}

/** A criterion outcome paired with whether it represents a true value conflict (→ human). */
interface CriterionOutcome extends CheckResult {
  conflict: boolean
}

async function runCriterion(
  job: Job,
  turns: JobTurn[],
  c: Criterion,
  registry?: ToolRegistry,
): Promise<CriterionOutcome> {
  switch (c.kind) {
    case "artifactExists":
      return { ...artifactExists(job, c), conflict: false }
    case "numericInRange":
      return { ...numericInRange(job, c), conflict: false }
    case "citationsGrounded": {
      const r = citationsGrounded(turns)
      return { ok: r.ok, detail: r.detail, conflict: false }
    }
    case "groundedValue": {
      if (!registry) return { ok: false, detail: `tool not available: ${c.tool}`, conflict: false }
      const r = await groundedValue(job, c, registry)
      // A failure where both values are present and disagree is a conflict (→ needs-human);
      // a "missing" failure (no artifact value / tool absent / tool error) is just unmet.
      const conflict = !r.ok && r.detail.startsWith("value conflict")
      return { ok: r.ok, detail: r.detail, conflict }
    }
  }
}

/**
 * Build the runner's `verify` dependency: a tiered, mostly-deterministic completion gate.
 *
 * Tiers, in order:
 *   0 — pure checks (artifactExists, numericInRange, citationsGrounded)
 *   1 — grounded re-derivation against the tool registry (groundedValue)
 *   2 — LLM judge ensemble over `fuzzyAspects` (only if a judge provider is supplied)
 *
 * A spec-less (or empty-criteria) job is treated as single-shot: it returns `done`
 * immediately so the runner does not loop forever.
 */
export function makeVerifier(deps: VerifierDeps): (job: Job, turns: JobTurn[]) => Promise<Verdict> {
  return async (job, turns) => {
    const spec = parseSpec(job.successSpec)
    if (!spec) {
      return { kind: "done", reason: "no success criteria — single-pass job complete" }
    }

    // Tier 0 + Tier 1: evaluate every criterion.
    let firstUnmet: CriterionOutcome | undefined
    for (const c of spec.criteria) {
      const outcome = await runCriterion(job, turns, c, deps.registry)
      if (outcome.conflict) {
        return { kind: "needs-human", reason: outcome.detail }
      }
      if (!outcome.ok && !firstUnmet) firstUnmet = outcome
    }
    if (firstUnmet) {
      return {
        kind: "continue",
        reason: firstUnmet.detail,
        continuation: `Not done yet: ${firstUnmet.detail}. Address it, then state completion.`,
      }
    }

    // Tier 2: fuzzy quality aspects via the judge ensemble.
    const aspects = spec.fuzzyAspects ?? []
    if (aspects.length === 0) {
      return { kind: "done", reason: "all deterministic criteria satisfied" }
    }
    if (!deps.judge) {
      return {
        kind: "done",
        reason: "all deterministic criteria satisfied; fuzzy aspects skipped (no judge provider)",
      }
    }

    const judged = await judgeAspects({
      judge: deps.judge,
      goal: job.goal,
      finalText: turns.at(-1)?.text ?? "",
      aspects,
      system: deps.system,
    })
    const passed = judged.filter((j) => j.pass).length
    const threshold = spec.passThreshold ?? DEFAULT_PASS_THRESHOLD
    const fraction = judged.length > 0 ? passed / judged.length : 1

    if (fraction >= threshold) {
      return { kind: "done", reason: "criteria + fuzzy aspects satisfied" }
    }
    const failed = judged.filter((j) => !j.pass).map((j) => j.aspect)
    return {
      kind: "continue",
      reason: `fuzzy aspects unmet (${passed}/${judged.length} passed, need ${threshold})`,
      continuation: `Not done yet — improve these aspects: ${failed.join("; ")}. Then state completion.`,
    }
  }
}
