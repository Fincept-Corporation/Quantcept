import type { FinceptClient } from "./client"

function qs(q?: Record<string, string | number | undefined>): string {
  if (!q) return ""
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== "") u.set(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ""
}
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

/**
 * Community "learnings" registry over the Fincept backend (/v1/learnings/*) —
 * LLM learning files with pgvector semantic search and P2P delivery. Reads are
 * JSON; `upload` is the one multipart endpoint (wraps text/bytes as a file).
 * `download` returns a short-lived presigned URL, not the bytes.
 */
export class FinceptLearnings {
  constructor(
    private readonly client: FinceptClient,
    private readonly token: () => string | undefined,
  ) {}

  private t() {
    return this.token()
  }

  /** Browse the approved feed (newest first by default). */
  list(query?: { page?: number; page_size?: number; sort?: string }) {
    return this.client.request<LearningsFeed>({ method: "GET", path: `/v1/learnings${qs(query)}`, token: this.t() })
  }
  /** Semantic search over the registry (1 credit). */
  search(q: string, limit?: number) {
    return this.client.request<LearningsSearchResult>({
      method: "GET",
      path: `/v1/learnings/search${qs({ q, limit })}`,
      token: this.t(),
    })
  }
  get(id: string) {
    return this.client.request<LearningItem>({ method: "GET", path: `/v1/learnings/${enc(id)}`, token: this.t() })
  }
  /** Get a short-lived presigned download URL for the learning's file (2 credits). */
  download(id: string) {
    return this.client.request<LearningDownload>({
      method: "GET",
      path: `/v1/learnings/${enc(id)}/download`,
      token: this.t(),
    })
  }
  /** The caller's contribution stats. */
  me() {
    return this.client.request<LearningStats>({ method: "GET", path: "/v1/learnings/me", token: this.t() })
  }
  update(id: string, body: { title: string; description?: string }) {
    return this.client.request<null>({ method: "PUT", path: `/v1/learnings/${enc(id)}`, token: this.t(), body })
  }
  remove(id: string) {
    return this.client.request<null>({ method: "DELETE", path: `/v1/learnings/${enc(id)}`, token: this.t() })
  }
  flag(id: string, reason: string) {
    return this.client.request<null>({
      method: "POST",
      path: `/v1/learnings/${enc(id)}/flag`,
      token: this.t(),
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
    return this.client.upload<LearningItem>("/v1/learnings", form, this.t())
  }
}
