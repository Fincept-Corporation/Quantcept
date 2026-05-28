const BASE_URL = process.env.LLM_BASE_URL ?? "https://api.minimax.io/anthropic"
const API_KEY = process.env.LLM_API_KEY ?? process.env.MINIMAX_API_KEY
const MODEL = process.env.LLM_MODEL ?? "MiniMax-M2.7"
const MAX_TOKENS = 8192

if (!API_KEY) {
  throw new Error("No LLM API key found. Set LLM_API_KEY in your environment or .env file. See .env.example.")
}

interface Message {
  role: "user" | "assistant"
  content: string
}

export interface ChatResult {
  text: string
  inputTokens: number
  outputTokens: number
  stopReason: string
}

export async function chat(
  messages: Message[],
  system?: string,
  onChunk?: (text: string) => void,
  onTokens?: (input: number, output: number) => void,
): Promise<ChatResult> {
  const body: Record<string, any> = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.7,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  }

  if (system) {
    body.system = system
  }

  if (onChunk) {
    body.stream = true

    const response = await fetch(`${BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      try {
        const parsed = JSON.parse(err)
        throw new Error(parsed.error?.message ?? `API error ${response.status}`)
      } catch (e) {
        if (e instanceof Error && e.message !== err) throw e
        throw new Error(`MiniMax API error ${response.status}: ${err}`)
      }
    }

    let fullText = ""
    let inputTokens = 0
    let outputTokens = 0
    let stopReason = "end_turn"
    // Track which content_block index is text vs thinking
    const blockTypes = new Map<number, string>()

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6).trim()
        if (data === "[DONE]") continue

        try {
          const event = JSON.parse(data)

          switch (event.type) {
            case "message_start":
              if (event.message?.usage) {
                inputTokens = event.message.usage.input_tokens ?? 0
                onTokens?.(inputTokens, outputTokens)
              }
              break

            case "content_block_start":
              if (event.content_block?.type) {
                blockTypes.set(event.index, event.content_block.type)
              }
              break

            case "content_block_delta": {
              const deltaType = event.delta?.type
              // Only emit text deltas, skip thinking and signature deltas
              if (deltaType === "text_delta" && event.delta.text) {
                fullText += event.delta.text
                onChunk(event.delta.text)
              }
              break
            }

            case "content_block_stop":
              break

            case "message_delta":
              if (event.delta?.stop_reason) {
                stopReason = event.delta.stop_reason
              }
              if (event.usage) {
                outputTokens = event.usage.output_tokens ?? outputTokens
                inputTokens = event.usage.input_tokens ?? inputTokens
                onTokens?.(inputTokens, outputTokens)
              }
              break

            case "message_stop":
              break

            case "ping":
              break
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    return { text: fullText, inputTokens, outputTokens, stopReason }
  }

  // Non-streaming
  const response = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.text()
    try {
      const parsed = JSON.parse(err)
      throw new Error(parsed.error?.message ?? `API error ${response.status}`)
    } catch (e) {
      if (e instanceof Error && e.message !== err) throw e
      throw new Error(`MiniMax API error ${response.status}: ${err}`)
    }
  }

  const result = await response.json()

  // Check MiniMax-specific base_resp for errors
  if (result.base_resp && result.base_resp.status_code !== 0) {
    throw new Error(`MiniMax error: ${result.base_resp.status_msg}`)
  }

  const text = (result.content ?? [])
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text || "")
    .join("")

  return {
    text,
    inputTokens: result.usage?.input_tokens ?? 0,
    outputTokens: result.usage?.output_tokens ?? 0,
    stopReason: result.stop_reason ?? "end_turn",
  }
}

const SYSTEM_PROMPT = `You are Quantcept, an AI finance assistant running in a terminal. You help with:
- Market analysis (stocks, indices, commodities, crypto)
- Portfolio risk assessment and optimization
- Financial calculations (Sharpe ratio, beta, volatility)
- Trading strategy analysis
- Financial news interpretation
- Indian markets (NIFTY, SENSEX, NSE, BSE) expertise

Keep responses concise and formatted for terminal display. Use plain text, no markdown images.
When showing data, use simple tables or bullet points.
If asked about real-time prices, clarify that you provide analysis based on your training data, not live feeds.`

export { SYSTEM_PROMPT }
