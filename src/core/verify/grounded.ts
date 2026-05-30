import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Job } from "@core/jobs/types"
import { executeTool } from "@core/tools/executor"
import { readOnlyPolicy } from "@core/tools/policy"
import type { ToolRegistry } from "@core/tools/registry"
import type { Criterion } from "./types"
import { asFiniteNumber, type CheckResult, navigate } from "./util"

// ---------------------------------------------------------------------------
// Tier 1 — re-derives a value from a read-only tool and compares it to the artifact.
// ---------------------------------------------------------------------------

/** Read a finite number from a JSON artifact at <path>/<pointer>; undefined on any failure. */
function readArtifactNumber(job: Job, path: string, pointer: string): number | undefined {
  const full = resolve(job.cwd, path)
  if (!existsSync(full)) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(full, "utf8"))
  } catch {
    return undefined
  }
  return asFiniteNumber(navigate(parsed, pointer))
}

/** From a tool's structured output, extract the comparable number: navigate the same
 *  pointer if the output is an object, else coerce the output itself to a number. */
function extractToolNumber(output: unknown, pointer: string): number | undefined {
  if (output !== null && typeof output === "object") {
    const viaPointer = asFiniteNumber(navigate(output, pointer))
    if (viaPointer !== undefined) return viaPointer
    // Fall through: some tools wrap a scalar (e.g. { result: 18.5 }) under a different key.
    const viaResult = asFiniteNumber((output as Record<string, unknown>).result)
    if (viaResult !== undefined) return viaResult
    return undefined
  }
  return asFiniteNumber(output)
}

/**
 * Re-call `c.tool` (read-only) and compare its value to the artifact value within
 * `c.tolerancePct` percent. The distinction between "missing" and "conflict" matters:
 * the orchestrator escalates a genuine value conflict (both present, disagree) to a
 * human, whereas a plain miss is just an unmet criterion.
 */
export async function groundedValue(
  job: Job,
  c: Extract<Criterion, { kind: "groundedValue" }>,
  registry: ToolRegistry,
): Promise<CheckResult> {
  const artifactValue = readArtifactNumber(job, c.path, c.pointer)
  if (artifactValue === undefined) {
    return { ok: false, detail: `artifact value missing at ${c.pointer} in ${c.path}` }
  }

  const tool = registry.get(c.tool)
  if (!tool) return { ok: false, detail: `tool not available: ${c.tool}` }

  const result = await executeTool(tool, c.input, {
    mode: "allow",
    cwd: job.cwd,
    abort: new AbortController().signal,
    ask: async () => "allow",
    effectPolicy: readOnlyPolicy(),
  })
  if (result.isError) {
    return { ok: false, detail: `grounding tool ${c.tool} errored: ${String(result.output)}` }
  }

  const toolValue = extractToolNumber(result.output, c.pointer)
  if (toolValue === undefined) {
    return { ok: false, detail: `could not extract a number from ${c.tool} output` }
  }

  // Relative difference vs the magnitude of the tool (ground-truth) value.
  const denom = Math.abs(toolValue) || Math.abs(artifactValue) || 1
  const diffPct = (Math.abs(artifactValue - toolValue) / denom) * 100
  const ok = diffPct <= c.tolerancePct
  return {
    ok,
    detail: ok
      ? `artifact ${artifactValue} matches ${c.tool} ${toolValue} (${diffPct.toFixed(2)}% ≤ ${c.tolerancePct}%)`
      : `value conflict: artifact ${artifactValue} vs ${c.tool} ${toolValue} (${diffPct.toFixed(2)}% > ${c.tolerancePct}%)`,
  }
}
