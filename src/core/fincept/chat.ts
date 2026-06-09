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

/** Concatenated text of a cloud message's text parts. */
export function cloudMessageText(m: CloudMessage): string {
  return m.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("")
}

/**
 * Split a resumed conversation's messages into the turns worth RENDERING and
 * the text of the last UNANSWERED question (to reload into the prompt for retry).
 *
 * A turn is unanswered when a `user` message is immediately followed by a
 * `failed` assistant reply or by no assistant reply at all. Those user bubbles
 * (and any `failed` assistant turns) are dropped from `rendered` so resume
 * doesn't show dead "You" bubbles; the most recent such question is returned as
 * `lastFailedQuestion`.
 */
export function partitionResumeMessages(messages: CloudMessage[]): {
  rendered: CloudMessage[]
  lastFailedQuestion: string
} {
  const rendered: CloudMessage[] = []
  let lastFailedQuestion = ""
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!
    if (m.role === "assistant" && m.status === "failed") continue
    if (m.role === "user") {
      const next = messages[i + 1]
      const answered = next && next.role === "assistant" && next.status !== "failed"
      if (!answered) {
        lastFailedQuestion = cloudMessageText(m)
        continue
      }
    }
    rendered.push(m)
  }
  return { rendered, lastFailedQuestion }
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

/** One client-tool call the cloud generation wants executed on this machine. */
export interface TerminalCall {
  call_id: string
  tool_name: string
  input: unknown
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

  /** Store-only: append already-generated turns (local generation + cloud storage).
   *  No generation, no credits. Mirrors a finished turn to the cloud transcript. */
  importMessages(
    conversationId: string,
    messages: { role: "user" | "assistant"; content: string; client_message_id?: string }[],
    idempotencyKey?: string,
  ): Promise<
    FinceptResult<{
      conversation_id: string
      messages: { id: string; role: string; replayed: boolean }[]
      count: number
    }>
  > {
    return this.client.request({
      method: "POST",
      path: `${BASE}/conversations/${conversationId}/import`,
      body: { messages },
      token: this.token,
      idempotencyKey,
    })
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

  // ── Terminal-tool bridge: let a cloud generation call this machine's local tools ──
  // The CLI registers its tool schemas, then (while a generation streams) polls for
  // calls, executes them locally, and posts the results back. See core/fincept/terminal-tools.

  /** Advertise this machine's locally-executable tools to the cloud model (10-min TTL; re-register per turn). */
  registerTerminalTools(
    tools: unknown[],
    terminalVersion = "quantcept-cli",
  ): Promise<FinceptResult<{ status: string }>> {
    return this.client.request({
      method: "POST",
      path: `${BASE}/agent/terminal-tools/register`,
      body: { tools, terminal_version: terminalVersion },
      token: this.token,
    })
  }

  /** Drain any pending client-tool calls the in-flight generation is waiting on. */
  pendingTerminalCalls(): Promise<FinceptResult<{ calls: TerminalCall[] }>> {
    return this.client.request({
      method: "GET",
      path: `${BASE}/agent/terminal-tools/pending`,
      token: this.token,
    })
  }

  /** Post a local tool's result back to the (blocked) generation by call id. */
  submitTerminalResult(callId: string, result: unknown): Promise<FinceptResult<null>> {
    return this.client.request({
      method: "POST",
      path: `${BASE}/agent/terminal-tools/result`,
      body: { call_id: callId, result },
      token: this.token,
    })
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
