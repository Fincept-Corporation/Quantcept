import type { ProviderConfig } from "@core/config/schema"
import { ProviderError } from "@shared/errors"
import { AnthropicMessagesAdapter } from "./adapters/anthropic-messages"
import { OpenAIChatAdapter } from "./adapters/openai-chat"
import type { Provider } from "./types"

export function createProvider(config: ProviderConfig): Provider {
  switch (config.id) {
    case "anthropic-messages":
      return new AnthropicMessagesAdapter(config)
    case "openai-chat":
      return new OpenAIChatAdapter(config)
    default:
      throw new ProviderError(`Unknown provider adapter: ${(config as { id: string }).id}`)
  }
}
