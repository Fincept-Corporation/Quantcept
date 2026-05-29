import { McpConfigSchema } from "@core/mcp/config"
import { z } from "zod/v4"

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
      rules: z
        .array(
          z.object({
            permission: z.string(),
            pattern: z.string(),
            action: z.enum(["allow", "ask", "deny"]),
          }),
        )
        .default([]),
    })
    .default({ defaultMode: "ask", rules: [] }),
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
  permissions: { defaultMode: "ask", rules: [] },
  mcp: { servers: {} },
}
