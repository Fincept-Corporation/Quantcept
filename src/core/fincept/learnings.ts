import { FinceptResource } from "./resource"

const enc = encodeURIComponent

export interface LearningItem {
  id: string
  title: string
  description?: string
  author?: string
  file_size?: number
  status?: string
  version?: number
  downloads?: number
  created_at?: string
  updated_at?: string
  tags?: string[]
  flags?: number
  torrent_hash?: string
  magnet_uri?: string
  seeders?: number
  leechers?: number
}
export interface LearningsFeed {
  items: LearningItem[]
  pagination: { page: number; page_size: number; total: number; total_pages?: number }
}
export interface LearningsSearchResult {
  query: string
  results: LearningItem[]
}
export interface LearningDownload {
  id: string
  title: string
  filename: string
  download_url: string
  expires_in: number
  file_size: number
  torrent_hash?: string
  magnet_uri?: string
}
export interface LearningStats {
  uploads: number
  approved: number
  total_downloads: number
}
export interface LearningsNetworkStats {
  network: { learnings: number; downloads: number }
  swarm: { seeding: number; peers: number; enabled: boolean; seeders: number; leechers: number }
  you: { uploads: number; approved: number; downloads: number }
  /** Public tracker announce URL clients use to seed (empty if not configured). */
  tracker_url?: string
}

export interface WorkflowRouteMatch {
  route_id: number
  version_id: number
  /** Learning public id. */
  id: string
  name: string
  version: number
  title: string
  body: string
  tools_required?: string[]
  performance: number
  score: number
}
export interface WorkflowClientEvent {
  event: "completed" | "checks_passed" | "checks_failed" | "regenerated"
  version_id: number
  generation_pid?: string
  conversation_pid?: string
  detail?: Record<string, unknown>
}
export interface CorpusSnapshotInfo {
  id: string
  title: string
  version: number
  sha256: string
  file_size: number
  created_at?: string
  torrent_hash?: string
  magnet_uri?: string
  download_url?: string
  expires_in?: number
}

/**
 * Community "learnings" registry over the Fincept backend (/v1/learnings/*) —
 * LLM learning files with pgvector semantic search and P2P delivery. Reads are
 * JSON; `upload` is the one multipart endpoint (wraps text/bytes as a file).
 * `download` returns a short-lived presigned URL, not the bytes.
 */
export class FinceptLearnings extends FinceptResource {
  /** Browse the approved feed (newest first by default). */
  list(query?: { page?: number; page_size?: number; sort?: string }) {
    return this.client.request<LearningsFeed>({
      method: "GET",
      path: `/v1/learnings${this.qs(query)}`,
      token: this.token(),
    })
  }
  /** Semantic search over the registry (1 credit). */
  search(q: string, limit?: number) {
    return this.client.request<LearningsSearchResult>({
      method: "GET",
      path: `/v1/learnings/search${this.qs({ q, limit })}`,
      token: this.token(),
    })
  }
  get(id: string) {
    return this.client.request<LearningItem>({ method: "GET", path: `/v1/learnings/${enc(id)}`, token: this.token() })
  }
  /** Get a short-lived presigned download URL for the learning's file (2 credits). */
  download(id: string) {
    return this.client.request<LearningDownload>({
      method: "GET",
      path: `/v1/learnings/${enc(id)}/download`,
      token: this.token(),
    })
  }
  /** The caller's contribution stats. */
  me() {
    return this.client.request<LearningStats>({ method: "GET", path: "/v1/learnings/me", token: this.token() })
  }
  /** Compact network + swarm + personal snapshot for the home screen (free). */
  stats() {
    return this.client.request<LearningsNetworkStats>({
      method: "GET",
      path: "/v1/learnings/stats",
      token: this.token(),
    })
  }
  update(id: string, body: { title: string; description?: string }) {
    return this.client.request<null>({ method: "PUT", path: `/v1/learnings/${enc(id)}`, token: this.token(), body })
  }
  remove(id: string) {
    return this.client.request<null>({ method: "DELETE", path: `/v1/learnings/${enc(id)}`, token: this.token() })
  }
  flag(id: string, reason: string) {
    return this.client.request<null>({
      method: "POST",
      path: `/v1/learnings/${enc(id)}/flag`,
      token: this.token(),
      body: { reason },
    })
  }
  /** Publish a learning (3 credits). Wraps the content as a file in a multipart upload. */
  upload(input: {
    title: string
    description?: string
    tags?: string[]
    filename?: string
    content: string | Uint8Array
  }) {
    const form = new FormData()
    form.set("title", input.title)
    if (input.description) form.set("description", input.description)
    if (input.tags?.length) form.set("tags", input.tags.join(","))
    form.set("file", new Blob([input.content], { type: "text/markdown" }), input.filename ?? "learning.md")
    return this.client.upload<LearningItem>("/v1/learnings", form, this.token())
  }
  /** Route a query against the workflow knowledge engine (free; null = no match). */
  route(query: string, opts?: { conversationId?: string; availableTools?: string[] }) {
    return this.client.request<{ match: WorkflowRouteMatch | null }>({
      method: "POST",
      path: "/v1/learnings/route",
      token: this.token(),
      body: { query, conversation_id: opts?.conversationId, available_tools: opts?.availableTools },
      // Routing sits in the send path of a local turn — bound it to the server
      // router's own internal budget so a black-holed network can't stall the
      // prompt for the default 30s.
      timeoutMs: 5_000,
    })
  }
  /** Report local-generation workflow outcomes (free; batch ≤20, detail ≤8KB each). */
  events(events: WorkflowClientEvent[]) {
    return this.client.request<{ accepted: number }>({
      method: "POST",
      path: "/v1/learnings/events",
      token: this.token(),
      body: { events },
    })
  }
  /** Latest corpus snapshot descriptor for the sidecar sync (free; null until built). */
  snapshotLatest() {
    return this.client.request<{ snapshot: CorpusSnapshotInfo | null }>({
      method: "GET",
      path: "/v1/learnings/snapshot/latest",
      token: this.token(),
    })
  }
}
