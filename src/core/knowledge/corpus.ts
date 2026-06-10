import { z } from "zod/v4"
import type { WorkflowCheck } from "./parser"

/**
 * Local corpus loader + offline matcher for the knowledge engine (spec §12).
 * The corpus.json manifest is built server-side from already-validated
 * workflows (finceptgo SnapshotManifest), so this loader validates shape, not
 * authoring rules. Online routing always prefers the server's /route
 * (embeddings + performance + stickiness); localRoute is the OFFLINE fallback:
 * deterministic token-overlap against trigger phrases — no embeddings, no
 * stickiness, no server telemetry.
 */

const corpusWorkflowSchema = z.object({
  name: z.string(),
  version: z.number(),
  title: z.string(),
  description: z.string().default(""),
  triggers: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  tools_required: z.array(z.string()).default([]),
  tools_optional: z.array(z.string()).default([]),
  inputs: z.array(z.unknown()).default([]),
  checks: z.array(z.unknown()).default([]),
  body: z.string(),
  performance: z.number().default(0.5),
})

const corpusManifestSchema = z.object({
  schema_version: z.number().min(1),
  corpus_version: z.number().min(1),
  built_at: z.string().optional(),
  workflows: z.array(corpusWorkflowSchema),
})

export interface CorpusWorkflow {
  name: string
  version: number
  title: string
  description: string
  triggers: string[]
  domains: string[]
  toolsRequired: string[]
  toolsOptional: string[]
  checks: WorkflowCheck[]
  body: string
  performance: number
}

export interface Corpus {
  corpusVersion: number
  workflows: CorpusWorkflow[]
}

/** Parse + shape-validate a corpus.json manifest. Throws on anything malformed. */
export function parseCorpus(raw: string): Corpus {
  const m = corpusManifestSchema.parse(JSON.parse(raw))
  return {
    corpusVersion: m.corpus_version,
    workflows: m.workflows.map((w) => ({
      name: w.name,
      version: w.version,
      title: w.title,
      description: w.description,
      triggers: w.triggers,
      domains: w.domains,
      toolsRequired: w.tools_required,
      toolsOptional: w.tools_optional,
      checks: w.checks as WorkflowCheck[],
      body: w.body,
      performance: w.performance,
    })),
  }
}

/** Load the synced corpus from disk (default ~/.quantcept/knowledge). null when absent/corrupt. */
export async function loadCorpus(dir?: string): Promise<Corpus | null> {
  const path = `${dir ?? defaultKnowledgeDir()}/corpus.json`
  try {
    const raw = await Bun.file(path).text()
    return parseCorpus(raw)
  } catch {
    return null
  }
}

/** Mirrors the Go sidecar's KnowledgeDir (cmd/learnings/sync.go — keep in sync). */
export function defaultKnowledgeDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "."
  return `${home}/.quantcept/knowledge`
}

// High-frequency function words carry no routing signal — counting them lets a
// short trigger false-positive on unrelated queries ("is this safe to eat"
// must not match "is this dividend safe").
const STOP_WORDS = new Set([
  "the", "this", "that", "these", "those", "what", "which", "with", "from",
  "your", "into", "will", "does", "has", "have", "are", "was", "were", "and",
  "for", "you", "how", "can", "should",
])

const tokenize = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  )

/**
 * Offline trigger matching: best token-overlap (Jaccard against the trigger's
 * tokens) across every workflow trigger. Deterministic and dependency-free —
 * deliberately cruder than the server's embedding route.
 */
export function localRoute(
  corpus: Corpus,
  query: string,
  availableTools: string[] | undefined,
  threshold: number,
): CorpusWorkflow | null {
  const q = tokenize(query)
  if (q.size === 0) return null
  let best: CorpusWorkflow | null = null
  let bestScore = 0
  for (const wf of corpus.workflows) {
    if (availableTools?.length && !wf.toolsRequired.every((t) => availableTools.includes(t))) continue
    for (const trigger of wf.triggers) {
      const tt = tokenize(trigger)
      if (tt.size === 0) continue
      let overlap = 0
      for (const tok of tt) if (q.has(tok)) overlap++
      // Denominator floor: a 1-2 content-token trigger must not be trivially
      // satisfiable by a single shared word.
      const score = overlap / Math.max(tt.size, 3)
      if (score > bestScore) {
        best = wf
        bestScore = score
      }
    }
  }
  return bestScore >= threshold ? best : null
}
