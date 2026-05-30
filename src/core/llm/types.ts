/** A base64-encoded image (e.g. a screenshot returned by the computer-use tool). */
export interface ImageData {
  mediaType: string
  data: string
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; output: unknown; isError: boolean; image?: ImageData }

export interface ChatMessage {
  role: "user" | "assistant"
  content: string | ContentBlock[]
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ChatRequest {
  messages: ChatMessage[]
  system?: string
  stream?: boolean
  tools?: ToolDefinition[]
}

export interface ChatResult {
  text: string
  blocks?: ContentBlock[]
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
