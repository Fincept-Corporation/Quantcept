import { z } from "zod/v4"
import { McpConfigSchema } from "@core/mcp/config"

export const ProviderConfigSchema = z.object({
  id: z.enum(["anthropic-messages", "openai-chat"]),
  model: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKey: z.string().optional(),
  maxTokens: z.number().int().positive().default(8192),
  temperature: z.number().min(0).max(2).default(0.7),
})

export const ConfigSchema = z.object({
  provider: ProviderConfigSchema,
  permissions: z
    .object({
      defaultMode: z.enum(["ask", "allow", "deny"]).default("ask"),
    })
    .default({ defaultMode: "ask" }),
  mcp: McpConfigSchema,
})

export type Config = z.infer<typeof ConfigSchema>
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>

export const defaultConfig: Config = {
  provider: {
    id: "anthropic-messages",
    model: "MiniMax-M2.7",
    baseUrl: "https://api.minimax.io/anthropic",
    maxTokens: 8192,
    temperature: 0.7,
  },
  permissions: { defaultMode: "ask" },
  mcp: { servers: {} },
}
