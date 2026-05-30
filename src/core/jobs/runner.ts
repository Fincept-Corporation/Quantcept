import type { AgentEventHandler } from "@core/agent/events"
import { runAgentTurn } from "@core/agent/loop"
import type { ChatMessage, Provider } from "@core/llm/types"
import type { PermissionDecision } from "@core/permissions/schema"
import type { RiskVerdict } from "@core/risk/limits"
import { readOnlyPolicy, tradingPolicy } from "@core/tools/policy"
import type { ToolRegistry } from "@core/tools/registry"
import type { Tool } from "@core/tools/Tool"
import type { JobStore } from "./store"
import type { Job, JobTurn } from "./types"

/** Completion decision from the verifier (Phase 3 supplies the real one). */
export interface Verdict {
  kind: "done" | "continue" | "needs-human"
  reason?: string
  continuation?: string
}

/** Budget gate (Phase 2 supplies the real BudgetGovernor). */
export interface JobGovernor {
  check(jobId: string): { ok: boolean }
  recordTurn(jobId: string, usage: { inputTokens: number; outputTokens: number }, model?: string): void
  /** Optional: returns an executor-compatible hook for per-tool-call enforcement. Absent on Phase-1 stubs. */
  executorHook?(jobId: string): { check(): { ok: boolean }; recordToolCall(isData: boolean): void }
}

export interface JobRunnerDeps {
  provider: Provider
  registry: ToolRegistry
  store: JobStore
  governor: JobGovernor
  verify: (job: Job, turns: JobTurn[]) => Promise<Verdict>
  system?: string
  model?: string
  onEvent?: AgentEventHandler
  /**
   * Sync pre-trade risk gate threaded into each agent turn. Present only for a trading-enabled
   * job (from buildAgentRegistry's `trading` wiring); a violating `place_order` is HARD-denied.
   */
  riskGate?: (tool: Tool, input: unknown) => RiskVerdict
  /**
   * Per-tool human-approval gate for `gate`-classed (irreversible) effects. The CLI supplies an
   * approval-aware ask backed by the PendingApprovalStore: it returns "allow" when a matching
   * human approval has been recorded (and consumes it once), else enqueues a pending approval and
   * returns "deny" — which the executor turns into a needsHuman result, pausing the job below.
   * Defaults to autoDenyAsk (deny every gate) when omitted, so an unwired runner never auto-approves.
   */
  ask?: (tool: Tool, input: unknown) => Promise<PermissionDecision>
}

const autoDenyAsk = async () => "deny" as const

function seedMessages(job: Job): ChatMessage[] {
  return [{ role: "user", content: job.goal }]
}

/** Drive a job to completion (or a pause boundary) over the single-turn loop, resuming from the journal. */
export async function runJob(job: Job, deps: JobRunnerDeps): Promise<Job> {
  const prior = deps.store.loadTurns(job.id)
  let messages: ChatMessage[] = prior.at(-1)?.messages ?? seedMessages(job)
  // Resume seam: a reloaded transcript ends on the assistant turn. Re-prime a trailing
  // user message so the next provider call is valid (real APIs require a trailing user turn).
  if (prior.length > 0 && messages.at(-1)?.role === "assistant") {
    messages = [...messages, { role: "user", content: "Continue toward the goal. State explicitly when complete." }]
  }
  let current = deps.store.markRunning(job.id)

  // Per-tool approval gate. Defaults to denying every `gate`-classed effect; the CLI threads in an
  // approval-aware ask so a human-approved order resumes and fills.
  const ask = deps.ask ?? autoDenyAsk

  for (;;) {
    if (!deps.governor.check(job.id).ok) return deps.store.pause(job.id, "budget")
    if (current.turnsUsed >= current.maxTurns) return deps.store.pause(job.id, "max-turns")

    const result = await runAgentTurn({
      provider: deps.provider,
      registry: deps.registry,
      messages,
      system: deps.system,
      mode: "ask",
      cwd: job.cwd,
      ask,
      effectPolicy: job.readOnly ? readOnlyPolicy() : tradingPolicy(),
      onEvent: deps.onEvent,
      budget: deps.governor.executorHook?.(job.id),
      riskGate: deps.riskGate,
    })
    messages = result.messages
    const usage = { inputTokens: result.inputTokens, outputTokens: result.outputTokens }
    deps.governor.recordTurn(job.id, usage, deps.model)

    const turn: JobTurn = {
      seq: current.turnsUsed,
      messages,
      text: result.text,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ts: Date.now(),
      model: deps.model,
    }
    deps.store.appendTurn(job.id, turn)
    current = deps.store.get(job.id)!

    // A gated, unapproved external action (e.g. an irreversible place_order the human has not yet
    // approved) pauses the job for human review BEFORE the verifier runs. On a later resume the
    // approval-aware ask will consume the recorded approval and let the placement through.
    if (result.gatedActions > 0) return deps.store.pause(job.id, "needs-human")

    const verdict = await deps.verify(current, deps.store.loadTurns(job.id))
    if (verdict.kind === "done") return deps.store.complete(job.id, verdict)
    if (verdict.kind === "needs-human") return deps.store.pause(job.id, "needs-human")
    messages.push({
      role: "user",
      content: verdict.continuation ?? "Continue toward the goal. State explicitly when complete.",
    })
  }
}
