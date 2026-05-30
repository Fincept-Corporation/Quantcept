import type { ChatMessage } from "./types"

/**
 * True if any message carries an image (today: a tool_result screenshot from computer-use).
 * The agent loop uses this to route image-bearing turns to a vision-capable provider when the
 * primary model is text-only (e.g. MiniMax, whose endpoint silently drops images).
 */
export function messagesContainImage(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result" && b.image !== undefined),
  )
}
