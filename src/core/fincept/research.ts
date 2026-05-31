import type { FinceptClient } from "./client"

export interface LlmOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  thinking?: boolean
}

export interface LlmResult {
  prompt: string
  response: string
  model: string
  usage: { input_tokens: number; output_tokens: number; total_tokens: number }
  processed_at: string
  /** Present only when thinking was enabled. */
  thinking?: string
  /** Present when the result was served from the 1h server cache. */
  cached?: boolean
  /** Present when the prompt carried tools. */
  tool_calls?: unknown[]
}

export interface VisualResult {
  image_url: string
  prompt: string
  analysis: string
  model: string
  usage?: unknown
}

export interface GrokipediaArticle {
  slug: string
  title?: string
  url?: string
  content_text?: string
  char_count?: number
  word_count?: number
  references_count?: number
  references?: unknown[]
}

export interface LlmTask {
  task_id: string
  status: "processing" | "completed" | "failed" | string
  data: LlmResult | null
  error: string | null
  created_at: string
}

/**
 * Research over the Fincept backend (/v1/research/* — LLM inference, visual
 * analysis, the Grokipedia KB, and news events). LLM calls hit an
 * Anthropic-compatible API (MiniMax by default) and are credit-metered.
 *
 * Complete API coverage: the sync `llm`, the async `llmAsync`/`llmStatus` pair,
 * `visualAnalysis`, `grokipedia`, and `newsEvents`. (The agent-facing tools wrap
 * only the synchronous subset; see tools.ts.)
 */
export class FinceptResearch {
  constructor(
    private readonly client: FinceptClient,
    private readonly token: () => string | undefined,
  ) {}

  private t() {
    return this.token()
  }

  /** Synchronous LLM inference (5 credits). Server-cached for 1h when no tools are passed. */
  llm(prompt: string, opts?: LlmOptions) {
    return this.client.request<LlmResult>({
      method: "POST",
      path: "/v1/research/llm",
      token: this.t(),
      body: {
        prompt,
        model: opts?.model,
        max_tokens: opts?.maxTokens,
        temperature: opts?.temperature,
        thinking: opts?.thinking,
      },
      timeoutMs: 90_000,
    })
  }

  /** Submit a background LLM task (0 credits up-front; 5 deducted on completion). Poll via llmStatus. */
  llmAsync(prompt: string, opts?: Omit<LlmOptions, "model">) {
    return this.client.request<{ task_id: string; message: string }>({
      method: "POST",
      path: "/v1/research/llm/async",
      token: this.t(),
      body: { prompt, max_tokens: opts?.maxTokens, temperature: opts?.temperature, thinking: opts?.thinking },
    })
  }

  /** Poll a background LLM task. 404 (FinceptError) once the 30-min TTL expires. */
  llmStatus(taskId: string) {
    return this.client.request<LlmTask>({
      method: "GET",
      path: `/v1/research/llm/status/${encodeURIComponent(taskId)}`,
      token: this.t(),
    })
  }

  /** Analyze an image at a public URL with a vision model (10 credits). */
  visualAnalysis(imageUrl: string, prompt: string, opts?: { maxTokens?: number; temperature?: number }) {
    return this.client.request<VisualResult>({
      method: "POST",
      path: "/v1/research/visual-analysis",
      token: this.t(),
      body: { image_url: imageUrl, prompt, max_tokens: opts?.maxTokens, temperature: opts?.temperature },
      timeoutMs: 90_000,
    })
  }

  /** Fetch a Grokipedia knowledge-base article by slug (1 credit). */
  grokipedia(slug: string, opts?: { extractRefs?: boolean; truncate?: number; citations?: boolean }) {
    return this.client.request<GrokipediaArticle>({
      method: "POST",
      path: "/v1/research/grokipedia",
      token: this.t(),
      body: { slug, extract_refs: opts?.extractRefs, truncate: opts?.truncate, citations: opts?.citations },
    })
  }

  /**
   * Paginated news events (3 credits). NOTE: the Go backend currently returns 503
   * `migration_pending` for this route (the SQLite source is not yet ported), so this
   * throws FinceptError until the backend lands. Kept for complete API coverage.
   */
  newsEvents(opts?: { page?: number; limit?: number }) {
    const u = new URLSearchParams()
    if (opts?.page) u.set("page", String(opts.page))
    if (opts?.limit) u.set("limit", String(opts.limit))
    const q = u.toString()
    return this.client.request<unknown>({
      method: "GET",
      path: `/v1/research/news-events${q ? `?${q}` : ""}`,
      token: this.t(),
    })
  }
}
