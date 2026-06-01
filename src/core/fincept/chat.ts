import { FinceptError } from "@shared/errors"
import type { FinceptClient, FinceptResult } from "./client"
import { type ChatStreamEvent, parseSseFrames, toChatEvent } from "./sse"

export interface CloudConversation {
  id: string
  title: string
  model: string | null
  mode: string
  source: string | null
  is_archived: boolean
  is_incognito: boolean
  message_count: number
  created_at: string
  updated_at: string
  last_message_at: string | null
}

export interface CloudMessagePart {
  idx: number
  type: string
  text: string | null
}

export interface CloudMessage {
  id: string
  role: "user" | "assistant"
  status: "complete" | "streaming" | "failed" | string
  parts: CloudMessagePart[]
  created_at: string
}

export interface ConversationPage {
  items: CloudConversation[]
  pagination: { page: number; page_size: number; total: number; pages: number }
}

export interface ConversationDetail {
  conversation: CloudConversation
  messages: CloudMessage[]
}

export interface SendBody {
  content: string
  client_message_id?: string
  parent_id?: string
  mode?: "lite" | "deep"
  source?: string
  auto_approve?: boolean
  attachment_ids?: string[]
}

export interface SendResult {
  user_message_id?: string
  generation_id: string
  stream_id: string
  stream_token: string
  replayed?: boolean
}

const BASE = "/v1/chat"

/**
 * Client for the Fincept backend chat plane (`/v1/chat`). JSON calls go through
 * FinceptClient (envelope + typed errors, incl. 402 InsufficientCreditsError);
 * the SSE reply stream is read directly via fetch (streamGeneration).
 */
export class FinceptChat {
  constructor(
    private readonly client: FinceptClient,
    private readonly token: string,
    private readonly baseUrl: string,
  ) {}

  createConversation(
    body: { title?: string; mode?: "lite" | "deep"; source?: string } = {},
  ): Promise<FinceptResult<CloudConversation>> {
    return this.client.request({ method: "POST", path: `${BASE}/conversations`, body, token: this.token })
  }

  listConversations(page = 1, pageSize = 50): Promise<FinceptResult<ConversationPage>> {
    return this.client.request({
      method: "GET",
      path: `${BASE}/conversations?page=${page}&page_size=${pageSize}`,
      token: this.token,
    })
  }

  getConversation(id: string): Promise<FinceptResult<ConversationDetail>> {
    return this.client.request({ method: "GET", path: `${BASE}/conversations/${id}`, token: this.token })
  }

  // updateConversation (rename/archive) deferred to P4 — needs "PATCH" added to
  // FinceptRequest.method in client.ts; not part of the core create→send→stream flow.

  deleteConversation(id: string): Promise<FinceptResult<null>> {
    return this.client.request({ method: "DELETE", path: `${BASE}/conversations/${id}`, token: this.token })
  }

  /** Send a user turn; server reserves credits and starts a generation. Throws
   *  InsufficientCreditsError on 402 and FinceptError("too_many_concurrent_generations") on 429. */
  send(conversationId: string, body: SendBody, idempotencyKey?: string): Promise<FinceptResult<SendResult>> {
    return this.client.request({
      method: "POST",
      path: `${BASE}/conversations/${conversationId}/messages`,
      body,
      token: this.token,
      idempotencyKey,
    })
  }

  cancelGeneration(genId: string): Promise<FinceptResult<null>> {
    return this.client.request({ method: "POST", path: `${BASE}/generations/${genId}/cancel`, token: this.token })
  }

  approveGeneration(genId: string, body: { approved: boolean; edited_input?: unknown }): Promise<FinceptResult<null>> {
    return this.client.request({
      method: "POST",
      path: `${BASE}/generations/${genId}/approve`,
      body,
      token: this.token,
    })
  }

  /**
   * Stream a generation's assistant reply over SSE. Native client authenticates
   * with the Bearer header (not the browser-only stream_token). Yields typed
   * events and returns after the terminal `done`. Reconnect with `lastEventId`.
   */
  async *streamGeneration(
    genId: string,
    opts: { lastEventId?: string; signal?: AbortSignal } = {},
  ): AsyncGenerator<ChatStreamEvent> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}${BASE}/generations/${genId}/stream`
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}`, Accept: "text/event-stream" }
    if (opts.lastEventId) headers["Last-Event-ID"] = opts.lastEventId

    let res: Response
    try {
      res = await fetch(url, { headers, signal: opts.signal })
    } catch (e) {
      throw new FinceptError(`stream connect failed: ${(e as Error)?.message ?? String(e)}`, "NETWORK")
    }
    if (!res.ok || !res.body) {
      throw new FinceptError(`stream failed (${res.status})`, `http_${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const { frames, rest } = parseSseFrames(buf)
        buf = rest
        for (const f of frames) {
          const ev = toChatEvent(f)
          yield ev
          if (ev.type === "done") return
        }
      }
    } finally {
      void reader.cancel().catch(() => {})
    }
  }
}
