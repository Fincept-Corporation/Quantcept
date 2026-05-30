import { McpConfigSchema } from "@core/mcp/config"
import { z } from "zod/v4"

/** Default Quantcept marketplace (curated finance plugins); overridable via config. */
export const DEFAULT_MARKETPLACE = "github:Fincept-Corporation/quantcept-marketplace"

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
  /**
   * Optional vision-capable provider. Image-bearing turns (computer-use screenshots) route
   * here when the primary model is text-only (e.g. MiniMax). If unset, computer-use stays
   * disabled. BYO — point it at Claude, GPT-4o, Gemini, or a self-hosted VL model.
   */
  visionProvider: ProviderConfigSchema.optional(),
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
  plugins: z
    .object({
      /** Marketplace seeded on first run; any source string parsePluginSource accepts. */
      defaultMarketplace: z.string().default(DEFAULT_MARKETPLACE),
      /** Re-fetch enabled plugins from their source on startup. */
      autoUpdate: z.boolean().default(false),
    })
    .default({ defaultMarketplace: DEFAULT_MARKETPLACE, autoUpdate: false }),
  budget: z
    .object({
      defaultMaxUsd: z.number().nonnegative().optional(),
      defaultMaxTokens: z.number().int().nonnegative().optional(),
      defaultMaxToolCalls: z.number().int().nonnegative().optional(),
      defaultMaxDataCalls: z.number().int().nonnegative().optional(),
      pricing: z
        .record(
          z.string(),
          z.object({
            inputPerM: z.number().nonnegative(),
            outputPerM: z.number().nonnegative(),
          }),
        )
        .optional(),
    })
    .default({}),
  scheduler: z
    .object({
      defaultExchange: z.enum(["XNYS"]).default("XNYS"),
      timezone: z.string().default("America/New_York"),
      maxStalenessSeconds: z.number().int().nonnegative().default(3600),
      defaultMissedPolicy: z.enum(["catch_up", "skip"]).default("skip"),
    })
    .default({
      defaultExchange: "XNYS",
      timezone: "America/New_York",
      maxStalenessSeconds: 3600,
      defaultMissedPolicy: "skip",
    }),
  risk: z
    .object({
      startingCash: z.number().nonnegative().default(100_000),
      maxOrderNotional: z.number().positive().optional(),
      maxDailyLossUsd: z.number().positive().optional(),
      maxDrawdownPct: z.number().positive().optional(),
      maxPositionQtyPerSymbol: z.number().positive().optional(),
    })
    .default({ startingCash: 100_000 }),
  broker: z
    .object({
      kind: z.enum(["paper"]).default("paper"),
      slippageBps: z.number().nonnegative().default(5),
      prices: z.record(z.string(), z.number().positive()).optional(), // seed quotes for the paper broker
    })
    .default({ kind: "paper", slippageBps: 5 }),
  /**
   * Autonomous trading is OFF by default (the SAFE default). When enabled, the autonomous-jobs
   * runner wires the order tools + risk gate; an order still routes irreversible→gate→needs-human
   * (it pauses) until the full approve/resume loop lands.
   */
  trading: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
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
  plugins: { defaultMarketplace: DEFAULT_MARKETPLACE, autoUpdate: false },
  budget: {},
  scheduler: {
    defaultExchange: "XNYS",
    timezone: "America/New_York",
    maxStalenessSeconds: 3600,
    defaultMissedPolicy: "skip",
  },
  risk: { startingCash: 100_000 },
  broker: { kind: "paper", slippageBps: 5 },
  trading: { enabled: false },
}
