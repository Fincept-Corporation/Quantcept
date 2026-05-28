import type { ProviderConfig } from "@core/config/schema"
import { ProviderError } from "@shared/errors"
import type { ChatRequest, ChatResult, Provider, StreamHandlers } from "../types"

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
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(req.system ? { system: req.system } : {}),
      ...(req.stream ? { stream: true } : {}),
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
    return {
      text,
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
    let fullText = ""
    let inputTokens = 0
    let outputTokens = 0
    let stopReason = "end_turn"
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
          if (event.type === "message_start" && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0
            handlers.onTokens?.(inputTokens, outputTokens)
          } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            fullText += event.delta.text
            handlers.onChunk?.(event.delta.text)
          } else if (event.type === "message_delta") {
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason
            if (event.usage) {
              outputTokens = event.usage.output_tokens ?? outputTokens
              inputTokens = event.usage.input_tokens ?? inputTokens
              handlers.onTokens?.(inputTokens, outputTokens)
            }
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }
    return { text: fullText, inputTokens, outputTokens, stopReason }
  }
}
