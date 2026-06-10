import type { WorkflowClientEvent, WorkflowRouteMatch } from "@core/fincept/learnings"
import { evaluateChecks } from "./checks"
import { type Corpus, type CorpusWorkflow, localRoute } from "./corpus"
import type { WorkflowCheck } from "./parser"

/**
 * Client-side knowledge routing (spec §12): the server's /route is
 * authoritative (embeddings + performance + stickiness + server telemetry);
 * the local corpus is the OFFLINE fallback. reportOutcome runs the local
 * check evaluator and ships client events — fire-and-forget, fail-open.
 */

export interface KnowledgeMatch {
  source: "server" | "local"
  routeId?: number
  versionId: number
  name: string
  version: number
  title: string
  body: string
  checks: WorkflowCheck[]
  performance: number
}

export interface KnowledgeEngineDeps {
  /** Server route; null = no match. Throw on transport failure (engine falls back). */
  remoteRoute: (
    query: string,
    opts: { conversationId?: string; availableTools?: string[] },
  ) => Promise<WorkflowRouteMatch | null>
  /** Local corpus loader; null when nothing synced. */
  loadCorpus: () => Promise<Corpus | null>
  /** Telemetry shipper (the /events endpoint). Throwing is swallowed. */
  reportEvents: (events: WorkflowClientEvent[]) => Promise<void>
  /** Offline match threshold (token-overlap). */
  localThreshold?: number
}

const LOCAL_THRESHOLD_DEFAULT = 0.7

export class KnowledgeEngine {
  constructor(private readonly deps: KnowledgeEngineDeps) {}

  /** Route a query: server first, local corpus fallback, null = vanilla turn. */
  async route(
    query: string,
    opts: { conversationId?: string; availableTools?: string[] },
  ): Promise<KnowledgeMatch | null> {
    try {
      const m = await this.deps.remoteRoute(query, opts)
      if (m) {
        return {
          source: "server",
          routeId: m.route_id,
          versionId: m.version_id,
          name: m.name,
          version: m.version,
          title: m.title,
          body: m.body,
          // Server matches don't carry checks on the wire; resolve them from
          // the local corpus when available so the local check-runner works.
          checks: await this.checksFor(m.name),
          performance: m.performance,
        }
      }
      return null // server answered no-match — authoritative, don't second-guess locally
    } catch {
      // Offline/unreachable → corpus fallback (no server telemetry this turn).
      const corpus = await this.deps.loadCorpus()
      if (!corpus) return null
      const wf = localRoute(corpus, query, opts.availableTools, this.deps.localThreshold ?? LOCAL_THRESHOLD_DEFAULT)
      return wf ? fromCorpus(wf) : null
    }
  }

  private async checksFor(name: string): Promise<WorkflowCheck[]> {
    const corpus = await this.deps.loadCorpus().catch(() => null)
    return corpus?.workflows.find((w) => w.name === name)?.checks ?? []
  }

  /** Evaluate checks against the final answer and ship completed + checks_* events. */
  async reportOutcome(
    match: KnowledgeMatch,
    outcome: { answer: string; toolsUsed: string[]; generationId?: string; conversationId?: string },
  ): Promise<void> {
    const events: WorkflowClientEvent[] = [
      {
        event: "completed",
        version_id: match.versionId,
        generation_pid: outcome.generationId,
        conversation_pid: outcome.conversationId,
      },
    ]
    if (match.checks.length > 0) {
      const { results, allPassed } = evaluateChecks(match.checks, outcome.answer, outcome.toolsUsed)
      events.push({
        event: allPassed ? "checks_passed" : "checks_failed",
        version_id: match.versionId,
        generation_pid: outcome.generationId,
        conversation_pid: outcome.conversationId,
        detail: { results },
      })
    }
    try {
      await this.deps.reportEvents(events)
    } catch {
      /* telemetry is fire-and-forget */
    }
  }
}

function fromCorpus(wf: CorpusWorkflow): KnowledgeMatch {
  return {
    source: "local",
    versionId: wf.versionId, // DB version id carried in the manifest; 0 for a
    // legacy manifest → server-side ingest skips unknown ids.
    name: wf.name,
    version: wf.version,
    title: wf.title,
    body: wf.body,
    checks: wf.checks,
    performance: wf.performance,
  }
}

/** The mandate block appended to the system prompt — mirrors chat's workflowSystemBlock. */
export function buildWorkflowSystemBlock(m: { title: string; body: string }): string {
  return (
    `\n\n## Mandated workflow: ${m.title}\n` +
    "A proven workflow matches this question. You MUST follow its steps in order, " +
    "use the tools it names (when available), and produce the answer in its Output format. " +
    "If a step is impossible (missing tool or data), say so explicitly and continue with the remaining steps.\n\n" +
    m.body
  )
}
