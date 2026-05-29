import type { ProviderConfig } from "@core/config/schema"
import { ProviderError } from "@shared/errors"
import type { ChatRequest, ChatResult, ContentBlock, Provider, StreamHandlers } from "../types"

function toWireContent(content: string | ContentBlock[]): unknown {
  if (typeof content === "string") return content
  return content.map((b) => {
    if (b.type === "text") return { type: "text", text: b.text }
    if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input }
    return {
      type: "tool_result",
      tool_use_id: b.toolUseId,
      content: typeof b.output === "string" ? b.output : JSON.stringify(b.output),
      is_error: b.isError,
    }
  })
}

interface ToolUseAccum {
  id: string
  name: string
  inputJson: string
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

export function assembleStreamEvents(
  events: Array<Record<string, any>>,
  onChunk: (text: string) => void,
): { text: string; blocks: ContentBlock[]; inputTokens: number; outputTokens: number; stopReason: string } {
  let text = ""
  let inputTokens = 0
  let outputTokens = 0
  let stopReason = "end_turn"
  const tools = new Map<number, ToolUseAccum>()

  for (const event of events) {
    if (event.type === "message_start" && event.message?.usage) {
      inputTokens = event.message.usage.input_tokens ?? 0
    } else if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
      const existing = tools.get(event.index)
      tools.set(event.index, {
        id: event.content_block.id,
        name: event.content_block.name,
        inputJson: existing?.inputJson ?? "",
      })
    } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      text += event.delta.text
      onChunk(event.delta.text)
    } else if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
      const acc = tools.get(event.index)
      if (acc) acc.inputJson += event.delta.partial_json ?? ""
    } else if (event.type === "message_delta") {
      if (event.delta?.stop_reason) stopReason = event.delta.stop_reason
      if (event.usage) {
        outputTokens = event.usage.output_tokens ?? outputTokens
        inputTokens = event.usage.input_tokens ?? inputTokens
      }
    }
  }

  const blocks: ContentBlock[] = [...tools.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, t]) => ({
      type: "tool_use",
      id: t.id,
      name: t.name,
      input: t.inputJson ? safeParseJson(t.inputJson) : {},
    }))
  return { text, blocks, inputTokens, outputTokens, stopReason }
}

export class AnthropicMessagesAdapter implements Provider {
  readonly id = "anthropic-messages"
  constructor(private readonly config: ProviderConfig) {
    if (!config.apiKey) throw new ProviderError("Missing API key for anthropic-messages provider")
  }

  buildRequest(req: ChatRequest) {
    const url = `${this.config.baseUrl}/v1/messages`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey!,
      "anthropic-version": "2023-06-01",
    }
    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages: req.messages.map((m) => ({ role: m.role, content: toWireContent(m.content) })),
      ...(req.system ? { system: req.system } : {}),
      ...(req.stream ? { stream: true } : {}),
      ...(req.tools
        ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) }
        : {}),
    }
    return { url, headers, body }
  }

  async chat(req: ChatRequest, handlers?: StreamHandlers): Promise<ChatResult> {
    const { url, headers, body } = this.buildRequest({ ...req, stream: !!handlers?.onChunk })
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) })
    if (!response.ok) {
      const errText = await response.text()
      throw new ProviderError(`LLM API error ${response.status}: ${errText}`)
    }
    if (handlers?.onChunk) return this.consumeStream(response, handlers)
    return this.consumeJson(response)
  }

  private async consumeJson(response: Response): Promise<ChatResult> {
    const result: any = await response.json()
    if (result.base_resp && result.base_resp.status_code !== 0) {
      throw new ProviderError(`LLM error: ${result.base_resp.status_msg}`)
    }
    const text = (result.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text ?? "")
      .join("")
    const blocks: ContentBlock[] = (result.content ?? [])
      .filter((b: any) => b.type === "tool_use")
      .map((b: any) => ({ type: "tool_use", id: b.id, name: b.name, input: b.input ?? {} }))
    return {
      text,
      blocks: blocks.length ? blocks : undefined,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
      stopReason: result.stop_reason ?? "end_turn",
    }
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
          if (event.type === "message_start" && event.message?.usage) {
            handlers.onTokens?.(event.message.usage.input_tokens ?? 0, 0)
          } else if (event.type === "message_delta" && event.usage) {
            handlers.onTokens?.(event.usage.input_tokens ?? 0, event.usage.output_tokens ?? 0)
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }
    const r = assembleStreamEvents(events, (t) => handlers.onChunk?.(t))
    return {
      text: r.text,
      blocks: r.blocks.length ? r.blocks : undefined,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      stopReason: r.stopReason,
    }
  }
}
