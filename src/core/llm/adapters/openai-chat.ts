import type { ProviderConfig } from "@core/config/schema"
import { ProviderError } from "@shared/errors"
import type { ChatRequest, ChatResult, Provider, StreamHandlers } from "../types"

export class OpenAIChatAdapter implements Provider {
  readonly id = "openai-chat"
  constructor(private readonly config: ProviderConfig) {
    if (!config.apiKey) throw new ProviderError("Missing API key for openai-chat provider")
  }

  buildRequest(req: ChatRequest) {
    if (req.messages.some((m) => Array.isArray(m.content))) {
      throw new ProviderError("openai-chat does not support tool content yet")
    }
    const url = `${this.config.baseUrl}/chat/completions`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    }
    const messages = [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ]
    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages,
      ...(req.stream ? { stream: true } : {}),
    }
    return { url, headers, body }
  }

  async chat(req: ChatRequest, handlers?: StreamHandlers): Promise<ChatResult> {
    const { url, headers, body } = this.buildRequest({ ...req, stream: !!handlers?.onChunk })
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) })
    if (!response.ok) throw new ProviderError(`LLM API error ${response.status}: ${await response.text()}`)
    if (handlers?.onChunk) return this.consumeStream(response, handlers)
    const result: any = await response.json()
    const text = result.choices?.[0]?.message?.content ?? ""
    return {
      text,
      inputTokens: result.usage?.prompt_tokens ?? 0,
      outputTokens: result.usage?.completion_tokens ?? 0,
      stopReason: result.choices?.[0]?.finish_reason ?? "stop",
    }
  }

  private async consumeStream(response: Response, handlers: StreamHandlers): Promise<ChatResult> {
    const reader = response.body?.getReader()
    if (!reader) throw new ProviderError("No response body")
    const decoder = new TextDecoder()
    let buffer = ""
    let fullText = ""
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
          const delta = event.choices?.[0]?.delta?.content
          if (delta) {
            fullText += delta
            handlers.onChunk?.(delta)
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }
    return { text: fullText, inputTokens: 0, outputTokens: 0, stopReason: "stop" }
  }
}
