import { buildAgentRegistry } from "@core/agent/registry"
import { type Budget, BudgetGovernor } from "@core/budget"
import { loadConfig } from "@core/config/load"
import type { Config } from "@core/config/schema"
import { type JobRunnerDeps, JobStore, runJob } from "@core/jobs"
import type { Job } from "@core/jobs/types"
import { createProvider } from "@core/llm/provider"
import type { Provider } from "@core/llm/types"
import { PendingApprovalStore } from "@core/risk/approvals"
import { isStale, nextRun, type Schedule } from "@core/schedule"
import { projectHash } from "@core/storage/paths"
import type { ToolRegistry as ToolRegistryType } from "@core/tools/registry"
import type { Tool } from "@core/tools/Tool"
import { makeVerifier } from "@core/verify"

const out = (s: string): void => {
  console.log(s)
}

// ---------------------------------------------------------------------------
// Testable tick orchestration
// ---------------------------------------------------------------------------

export interface TickOptions {
  store: JobStore
  projectHash: string
  /** production: (j) => runJob(j, deps). Tests pass a stub that records ids. */
  run: (job: Job) => Promise<unknown>
  now: number
  maxStalenessSeconds: number
  log?: (msg: string) => void
}

/**
 * Run every due job for a project, with a finance-correctness staleness guard:
 * a scheduled job whose slot is older than `maxStalenessSeconds` is skipped
 * (not run on stale data) and advanced to its next future slot.
 */
export async function tickDueJobs(o: TickOptions): Promise<{ ran: string[]; skipped: string[] }> {
  const due = o.store.claimDue(o.projectHash, o.now)
  const ran: string[] = []
  const skipped: string[] = []
  for (const job of due) {
    const sched = job.schedule as Schedule | undefined
    if (sched && job.nextRunAt !== undefined && isStale(job.nextRunAt, o.now, o.maxStalenessSeconds)) {
      o.log?.(
        `skip ${job.id}: stale (scheduled ${new Date(job.nextRunAt).toISOString()}, now ${new Date(o.now).toISOString()})`,
      )
      o.store.setNextRun(job.id, nextRun(sched, new Date(o.now)).getTime()) // advance past the stale slot
      skipped.push(job.id)
      continue
    }
    await o.run(job)
    o.store.setLastRun(job.id, o.now)
    if (sched) o.store.setNextRun(job.id, nextRun(sched, new Date(o.now)).getTime())
    ran.push(job.id)
  }
  return { ran, skipped }
}

// ---------------------------------------------------------------------------
// Real deps builder (lazy: only `run` and `tick` need an API key + provider)
// ---------------------------------------------------------------------------

/** Provider/registry/verifier are built once per CLI invocation and shared across every job in a tick. */
interface SharedRunDeps {
  config: Config
  provider: Provider
  registry: ToolRegistryType
  verify: JobRunnerDeps["verify"]
  model?: string
  /** Present only when config.trading.enabled — the pre-trade risk gate threaded into each job. */
  riskGate?: JobRunnerDeps["riskGate"]
  /** Durable human-approval queue for gated (irreversible) actions; backs the per-job approval ask. */
  approvals: PendingApprovalStore
  /** Release MCP connections (and the trading ledger/outbox) opened by the canonical registry builder. */
  dispose: () => Promise<void>
}

/**
 * Build the once-per-invocation shared deps on the canonical headless registry: jobs now get
 * the FULL read-capable toolset (file read/glob/grep, shell-as-read excluded, finance, MCP,
 * sub-agents) plus job-control tools — not just the 5 finance tools. readOnly:true keeps it to
 * read-effect tools, the autonomous-jobs sandbox. Async (MCP start) and returns a disposer.
 */
async function buildShared(store: JobStore): Promise<SharedRunDeps> {
  const config = loadConfig()
  const provider = createProvider(config.provider)
  // Autonomous trading is OFF by default. When enabled, drop read-only and wire the order tools
  // + risk gate over the canonical registry; ctxId is the stable project hash so the engine
  // idempotency key (`${ctxId}:${n}`) is deterministic for this project across runs.
  const trading = config.trading.enabled ? { ctxId: projectHash(process.cwd()) } : undefined
  const built = await buildAgentRegistry({
    config,
    provider,
    cwd: process.cwd(),
    readOnly: !trading,
    jobStore: store,
    trading,
  })
  const verify = makeVerifier({ registry: built.registry, judge: provider })
  // Durable approval queue shared across every job in this tick. (The order audit log is wired
  // inside buildAgentRegistry via onAudit and needs no handle here.)
  const approvals = new PendingApprovalStore()
  return {
    config,
    provider,
    registry: built.registry,
    verify,
    model: config.provider.model,
    riskGate: built.riskGate,
    approvals,
    // Wrap the registry disposer so the approval queue's DB handle is released too.
    dispose: async () => {
      await built.dispose()
      approvals.close()
    },
  }
}

/** Per-job budget: job overrides config; config supplies the defaults. `job.budget` may be undefined/non-object. */
function jobBudget(config: Config, job: Job): Budget {
  const jb = (typeof job.budget === "object" && job.budget !== null ? job.budget : {}) as Partial<Budget>
  return {
    maxUsd: jb.maxUsd ?? config.budget.defaultMaxUsd,
    maxTokens: jb.maxTokens ?? config.budget.defaultMaxTokens,
    maxToolCalls: jb.maxToolCalls ?? config.budget.defaultMaxToolCalls,
    maxDataCalls: jb.maxDataCalls ?? config.budget.defaultMaxDataCalls,
  }
}

/**
 * Approval-aware ask for a gated (irreversible) action. On each tick the executor calls this when
 * an `irreversible` effect needs human approval:
 *   • If a matching human approval has been recorded, consume it ONCE and return "allow" → the
 *     order proceeds and fills.
 *   • Otherwise enqueue a single `pending` approval (deduped across repeated ticks so one paused
 *     order does not pile up N identical rows) and return "deny" → the executor returns needsHuman
 *     and the runner pauses the job for human review.
 * The JSON.stringify comparison is wrapped defensively so an unserializable input can never throw
 * here (it simply skips the dedupe and may enqueue — safe, never silently auto-approves).
 */
function approvalAwareAsk(
  approvals: PendingApprovalStore,
  job: Job,
): (tool: Tool, input: unknown) => Promise<"allow" | "deny"> {
  return async (tool, input) => {
    if (approvals.consumeApproval(job.id, tool.name, input)) return "allow"
    // Avoid duplicate enqueues across repeated ticks of the same paused order.
    let dup = false
    try {
      const want = JSON.stringify(input)
      dup = approvals
        .list("pending")
        .some((a) => a.jobId === job.id && a.action === tool.name && JSON.stringify(a.payload) === want)
    } catch {
      dup = false
    }
    if (!dup) approvals.enqueue({ jobId: job.id, action: tool.name, payload: input })
    return "deny"
  }
}

/** Compose a per-job governor (its own budget) on top of the shared, once-built deps. */
function depsForJob(shared: SharedRunDeps, store: JobStore, job: Job): JobRunnerDeps {
  const governor = new BudgetGovernor({
    budget: jobBudget(shared.config, job),
    pricing: shared.config.budget.pricing,
  })
  return {
    provider: shared.provider,
    registry: shared.registry,
    store,
    governor,
    verify: shared.verify,
    model: shared.model,
    riskGate: shared.riskGate,
    ask: approvalAwareAsk(shared.approvals, job),
  }
}

// ---------------------------------------------------------------------------
// Tiny flag parser
// ---------------------------------------------------------------------------

interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | boolean>
}

/**
 * Split `rest` into positionals and flags. Supports:
 *   --flag value   --flag=value   --flag   --flag=false
 * Everything before the first `--flag` is treated as positional; a bare `--flag`
 * (with no `=value` and no following non-flag token) becomes boolean `true`.
 */
function parseArgs(rest: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i] as string
    if (!tok.startsWith("--")) {
      positional.push(tok)
      continue
    }
    const body = tok.slice(2)
    const eq = body.indexOf("=")
    if (eq !== -1) {
      const key = body.slice(0, eq)
      const val = body.slice(eq + 1)
      flags[key] = val === "true" ? true : val === "false" ? false : val
      continue
    }
    // bare --flag: consume the next token as its value unless it is another flag.
    const next = rest[i + 1]
    if (next !== undefined && !next.startsWith("--")) {
      flags[body] = next
      i++
    } else {
      flags[body] = true
    }
  }
  return { positional, flags }
}

function flagNumber(v: string | boolean | undefined): number | undefined {
  if (typeof v !== "string") return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function flagJson(v: string | boolean | undefined, label: string): unknown {
  if (typeof v !== "string") return undefined
  try {
    return JSON.parse(v)
  } catch {
    throw new Error(`--${label} must be valid JSON`)
  }
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim()
  return oneLine.length <= n ? oneLine : `${oneLine.slice(0, n - 1)}…`
}

const ADD_USAGE =
  "add <goal...> [--max-turns N] [--max-usd N] [--max-tokens N] [--max-tool-calls N] [--max-data-calls N] [--schedule <json>] [--success <json>] [--once] [--read-only=false]"

const USAGE = [
  "usage: quantcept jobs <action>",
  `  ${ADD_USAGE}`,
  "  list                  list this project's jobs",
  "  run <id>              run a job to completion (or a pause boundary)",
  "  tick                  run all due jobs (the cron entrypoint)",
  "  install               print OS-scheduler commands to run `jobs tick` every minute",
  "  logs <id>             print a job's turn-by-turn journal",
  "  pause <id>            pause a job (needs-human)",
  "  resume <id>           make a paused job claimable again",
  "  approvals             list pending human-approval requests for gated actions",
  "  approve <id>          approve a pending action (it fills on the next run/tick)",
  "  deny <id>             deny a pending action",
].join("\n")

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------

/** Headless `quantcept jobs …` verb: create / inspect / run autonomous agent jobs. */
export async function runJobsCli(action: string | undefined, rest: string[]): Promise<void> {
  const store = new JobStore()
  try {
    switch (action) {
      case "add": {
        const { positional, flags } = parseArgs(rest)
        const goal = positional.join(" ").trim()
        if (!goal) {
          out(`usage: quantcept jobs ${ADD_USAGE}`)
          return
        }
        const schedule = (flags.once ? { kind: "once", at: Date.now() } : flagJson(flags.schedule, "schedule")) as
          | Schedule
          | undefined
        const successSpec = flagJson(flags.success, "success")
        // --read-only=false disables read-only; default (absent) keeps it on.
        const readOnly = flags["read-only"] !== false

        // Per-job budget ceilings. Only set keys that were actually passed.
        const b: Partial<Budget> = {}
        const maxUsd = flagNumber(flags["max-usd"])
        const maxTokens = flagNumber(flags["max-tokens"])
        const maxToolCalls = flagNumber(flags["max-tool-calls"])
        const maxDataCalls = flagNumber(flags["max-data-calls"])
        if (maxUsd !== undefined) b.maxUsd = maxUsd
        if (maxTokens !== undefined) b.maxTokens = maxTokens
        if (maxToolCalls !== undefined) b.maxToolCalls = maxToolCalls
        if (maxDataCalls !== undefined) b.maxDataCalls = maxDataCalls

        const id = crypto.randomUUID().slice(0, 8)
        store.create({
          id,
          cwd: process.cwd(),
          goal,
          maxTurns: flagNumber(flags["max-turns"]),
          readOnly,
          successSpec,
          schedule,
          budget: Object.keys(b).length ? b : undefined,
        })
        if (schedule) {
          store.setNextRun(id, nextRun(schedule, new Date()).getTime())
        }
        out(id)
        return
      }

      case undefined:
      case "list": {
        const jobs = store.listByProject(projectHash(process.cwd()))
        if (!jobs.length) {
          out("No jobs. Try: quantcept jobs add <goal...>")
          return
        }
        out(["ID", "STATUS", "TURNS", "NEXT_RUN", "GOAL"].join("\t"))
        for (const j of jobs) {
          const next = j.nextRunAt !== undefined ? new Date(j.nextRunAt).toISOString() : "—"
          out([j.id, j.status, `${j.turnsUsed}/${j.maxTurns}`, next, truncate(j.goal, 50)].join("\t"))
        }
        return
      }

      case "run": {
        const id = rest[0]
        if (!id) return out("usage: quantcept jobs run <id>")
        const job = store.get(id)
        if (!job) return out(`No such job: ${id}`)
        const shared = await buildShared(store)
        try {
          const final = await runJob(job, depsForJob(shared, store, job))
          const lastTurn = store.loadTurns(id).at(-1)
          out(`job ${final.id}: ${final.status}${final.pauseReason ? ` (${final.pauseReason})` : ""}`)
          if (lastTurn?.text) out(truncate(lastTurn.text, 400))
        } finally {
          await shared.dispose()
        }
        return
      }

      case "tick": {
        const config = loadConfig()
        const ph = projectHash(process.cwd())
        const shared = await buildShared(store)
        try {
          const res = await tickDueJobs({
            store,
            projectHash: ph,
            run: (job) => runJob(job, depsForJob(shared, store, job)),
            now: Date.now(),
            maxStalenessSeconds: config.scheduler.maxStalenessSeconds,
            log: (m) => out(m),
          })
          out(`ran: [${res.ran.join(", ")}] skipped(stale): [${res.skipped.join(", ")}]`)
        } finally {
          await shared.dispose()
        }
        return
      }

      case "install": {
        out("Windows (Task Scheduler) — run every minute:")
        out('  schtasks /Create /SC MINUTE /MO 1 /TN "Quantcept-Jobs" /TR "quantcept jobs tick"')
        out("Linux / macOS (cron) — add to `crontab -e`:")
        out("  * * * * * quantcept jobs tick")
        out(`Then \`quantcept jobs add "<goal>" --schedule '{"kind":"interval","everyMinutes":60}'\`.`)
        return
      }

      case "logs": {
        const id = rest[0]
        if (!id) return out("usage: quantcept jobs logs <id>")
        const turns = store.loadTurns(id)
        if (!turns.length) {
          out(`No turns for job ${id}.`)
          return
        }
        for (const t of turns) {
          out(`#${t.seq}`)
          out(t.text)
        }
        return
      }

      case "pause": {
        const id = rest[0]
        if (!id) return out("usage: quantcept jobs pause <id>")
        if (!store.get(id)) return out(`No such job: ${id}`)
        store.pause(id, "needs-human")
        out(`Paused ${id}`)
        return
      }

      case "resume": {
        const id = rest[0]
        if (!id) return out("usage: quantcept jobs resume <id>")
        if (!store.get(id)) return out(`No such job: ${id}`)
        store.resume(id)
        out(`Resumed ${id}`)
        return
      }

      case "approvals": {
        const approvals = new PendingApprovalStore()
        try {
          const pending = approvals.list("pending")
          if (!pending.length) {
            out("No pending approvals.")
            return
          }
          out(["ID", "JOB", "ACTION", "PAYLOAD"].join("\t"))
          for (const a of pending) {
            out([a.id, a.jobId ?? "—", a.action, truncate(JSON.stringify(a.payload ?? {}), 60)].join("\t"))
          }
        } finally {
          approvals.close()
        }
        return
      }

      case "approve": {
        const id = rest[0]
        if (!id) return out("usage: quantcept jobs approve <id>")
        const approvals = new PendingApprovalStore()
        try {
          if (!approvals.get(id)) return out(`No such approval: ${id}`)
          approvals.resolve(id, "approved")
          out(`Approved ${id} (it will fill on the next \`jobs run\`/\`jobs tick\`)`)
        } finally {
          approvals.close()
        }
        return
      }

      case "deny": {
        const id = rest[0]
        if (!id) return out("usage: quantcept jobs deny <id>")
        const approvals = new PendingApprovalStore()
        try {
          if (!approvals.get(id)) return out(`No such approval: ${id}`)
          approvals.resolve(id, "denied")
          out(`Denied ${id}`)
        } finally {
          approvals.close()
        }
        return
      }

      default:
        out(`Unknown jobs action: ${action}`)
        out(USAGE)
        return
    }
  } finally {
    store.close()
  }
}
