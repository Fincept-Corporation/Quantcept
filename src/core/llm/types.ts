export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  system?: string
  stream?: boolean
}

export interface ChatResult {
  text: string
  inputTokens: number
  outputTokens: number
  stopReason: string
}

export interface StreamHandlers {
  onChunk?: (text: string) => void
  onTokens?: (input: number, output: number) => void
}

export interface Provider {
  readonly id: string
  chat(req: ChatRequest, handlers?: StreamHandlers): Promise<ChatResult>
}
