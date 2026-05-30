import type { ProviderConfig } from "@core/config/schema"
import { ProviderError } from "@shared/errors"
import type { ChatRequest, ChatResult, ContentBlock, Provider, StreamHandlers } from "../types"

interface ToolCallAccum {
  id: string
  name: string
  args: string
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

/** OpenAI uses finish_reason "tool_calls"; the loop keys off our "tool_use". */
function mapStopReason(finish: string | undefined): string {
  return finish === "tool_calls" ? "tool_use" : (finish ?? "stop")
}

/**
 * Flatten our ChatMessage[] into OpenAI chat messages:
 * - assistant text + tool_use → one assistant message with `tool_calls`
 * - tool_result → a `role:"tool"` message; an image-bearing result also emits a following
 *   `role:"user"` message with an `image_url` block (OpenAI tool messages can't carry images).
 * This is what lets an OpenAI-compatible vision model (e.g. Ollama gemma4) drive computer-use.
 */
function toWireMessages(req: ChatRequest): unknown[] {
  const out: unknown[] = []
  if (req.system) out.push({ role: "system", content: req.system })

  for (const m of req.messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content })
      continue
    }

    const textParts: string[] = []
    const toolCalls: unknown[] = []
    const toolMessages: unknown[] = []
    const images: unknown[] = []

    for (const b of m.content) {
      if (b.type === "text") {
        textParts.push(b.text)
      } else if (b.type === "tool_use") {
        toolCalls.push({
          id: b.id,
          type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        })
      } else {
        const text = typeof b.output === "string" ? b.output : b.output == null ? "" : JSON.stringify(b.output)
        toolMessages.push({ role: "tool", tool_call_id: b.toolUseId, content: text })
        if (b.image) {
          images.push({ type: "image_url", image_url: { url: `data:${b.image.mediaType};base64,${b.image.data}` } })
        }
      }
    }

    if (m.role === "assistant" && toolCalls.length > 0) {
      out.push({ role: "assistant", content: textParts.join(""), tool_calls: toolCalls })
    } else if (toolMessages.length > 0) {
      out.push(...toolMessages)
      if (images.length > 0) out.push({ role: "user", content: images })
    } else if (textParts.length > 0) {
      out.push({ role: m.role, content: textParts.join("") })
    }
  }
  return out
}

export function parseChatCompletion(result: Record<string, any>): ChatResult {
  const msg = result.choices?.[0]?.message ?? {}
  const blocks: ContentBlock[] = (msg.tool_calls ?? []).map((tc: Record<string, any>) => ({
    type: "tool_use",
    id: tc.id,
    name: tc.function?.name,
    input: tc.function?.arguments ? safeParseJson(tc.function.arguments) : {},
  }))
  return {
    text: typeof msg.content === "string" ? msg.content : "",
    blocks: blocks.length ? blocks : undefined,
    inputTokens: result.usage?.prompt_tokens ?? 0,
    outputTokens: result.usage?.completion_tokens ?? 0,
    stopReason: mapStopReason(result.choices?.[0]?.finish_reason),
  }
}

export function assembleOpenAIStream(events: Array<Record<string, any>>, onChunk: (t: string) => void): ChatResult {
  let text = ""
  let inputTokens = 0
  let outputTokens = 0
  let finish: string | undefined
  const tools = new Map<number, ToolCallAccum>()

  for (const event of events) {
    const choice = event.choices?.[0]
    const delta = choice?.delta
    if (delta?.content) {
      text += delta.content
      onChunk(delta.content)
    }
    if (Array.isArray(delta?.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx: number = tc.index ?? 0
        const acc = tools.get(idx) ?? { id: "", name: "", args: "" }
        if (tc.id) acc.id = tc.id
        if (tc.function?.name) acc.name = tc.function.name
        if (tc.function?.arguments) acc.args += tc.function.arguments
        tools.set(idx, acc)
      }
    }
    if (choice?.finish_reason) finish = choice.finish_reason
    if (event.usage) {
      inputTokens = event.usage.prompt_tokens ?? inputTokens
      outputTokens = event.usage.completion_tokens ?? outputTokens
    }
  }

  const blocks: ContentBlock[] = [...tools.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, t]) => ({ type: "tool_use", id: t.id, name: t.name, input: t.args ? safeParseJson(t.args) : {} }))

  return {
    text,
    blocks: blocks.length ? blocks : undefined,
    inputTokens,
    outputTokens,
    stopReason: mapStopReason(finish),
  }
}

export class OpenAIChatAdapter implements Provider {
  readonly id = "openai-chat"
  constructor(private readonly config: ProviderConfig) {}

  buildRequest(req: ChatRequest) {
    const url = `${this.config.baseUrl}/chat/completions`
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    // Local servers (Ollama) need no key; only send Authorization when one is configured.
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`
    // GPT-5 and o-series reject `max_tokens` and require `max_completion_tokens`; Ollama/MiniMax
    // and gpt-4o use the legacy `max_tokens`.
    const newParamModel = /^(gpt-5|o\d)/i.test(this.config.model)
    const body: Record<string, unknown> = {
      model: this.config.model,
      [newParamModel ? "max_completion_tokens" : "max_tokens"]: this.config.maxTokens,
      temperature: this.config.temperature,
      messages: toWireMessages(req),
      ...(req.tools
        ? {
            tools: req.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.inputSchema },
            })),
          }
        : {}),
      ...(req.stream ? { stream: true } : {}),
    }
    return { url, headers, body }
  }

  async chat(req: ChatRequest, handlers?: StreamHandlers): Promise<ChatResult> {
    const { url, headers, body } = this.buildRequest({ ...req, stream: !!handlers?.onChunk })
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) })
    if (!response.ok) throw new ProviderError(`LLM API error ${response.status}: ${await response.text()}`)
    if (handlers?.onChunk) return this.consumeStream(response, handlers)
    return parseChatCompletion(await response.json())
  }

  private async consumeStream(response: Response, handlers: StreamHandlers): Promise<ChatResult> {
    const reader = response.body?.getReader()
    if (!reader) throw new ProviderError("No response body")
    const decoder = new TextDecoder()
    let buffer = ""
    const events: Array<Record<string, any>> = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6).trim()
        if (data === "[DONE]") continue
        try {
          const event = JSON.parse(data)
          events.push(event)
          if (event.usage) handlers.onTokens?.(event.usage.prompt_tokens ?? 0, event.usage.completion_tokens ?? 0)
        } catch {
          // skip malformed SSE lines
        }
      }
    }
    return assembleOpenAIStream(events, (t) => handlers.onChunk?.(t))
  }
}
