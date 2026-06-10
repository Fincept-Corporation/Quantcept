import { McpConfigSchema } from "@core/mcp/config"
import { z } from "zod/v4"

/** Default Quantcept marketplace (curated finance plugins); overridable via config. */
export const DEFAULT_MARKETPLACE = "github:Fincept-Corporation/quantcept-marketplace"

/**
 * The hosted Quantcept backend. This is the ONLY backend the app talks to — the base URL is
 * fixed (not user-, settings-, or env-configurable). `loadConfig` forces `fincept.baseUrl` to
 * this value via `applyFinceptHost`, so any stale persisted `http://localhost:8000` is ignored.
 */
export const FINCEPT_API_URL = "https://api.quantcept.io"

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
  /**
   * Fincept backend account. The mandatory auth gate stores the user's API key here (user-level
   * settings only — never project, never committed). `baseUrl` is fixed to the hosted backend
   * ({@link FINCEPT_API_URL}) and forced on load; it is not user-, settings-, or env-configurable.
   * The field is retained so the (injectable) client constructors keep a single value to read.
   * `FINCEPT_API_KEY` may still seed the key from env (CI / shared dev key).
   */
  fincept: z
    .object({
      baseUrl: z.string().min(1).default(FINCEPT_API_URL),
      apiKey: z.string().optional(),
      sessionToken: z.string().optional(),
      userId: z.string().optional(),
      email: z.string().optional(),
      username: z.string().optional(),
      lastValidatedAt: z.string().optional(),
      // "Connected to the network by default" — seed downloaded learnings in the
      // background to contribute to the P2P swarm. Set false to opt out.
      seedByDefault: z.boolean().default(true),
    })
    .default({ baseUrl: FINCEPT_API_URL, seedByDefault: true }),
  /**
   * Chat engine — two independent axes:
   *  - generation: "cloud" (Fincept server-side) | "local" (on-device agent loop)
   *  - storage:    "cloud" (Fincept chat plane)  | "local" (on-device session store)
   * Cloud generation always persists server-side, so `storage` only applies when
   * generation is "local". Switch in Settings.
   */
  chat: z
    .object({
      generation: z.enum(["cloud", "local"]).default("cloud"),
      storage: z.enum(["cloud", "local"]).default("cloud"),
    })
    .default({ generation: "cloud", storage: "cloud" }),
  /**
   * Knowledge engine (workflow routing) — client-side behavior only; the server
   * routes cloud generations regardless of these settings.
   */
  knowledge: z
    .object({
      /** Route local generations against the workflow corpus. */
      localRouting: z.boolean().default(true),
      /** Offline trigger-match threshold (token overlap 0..1). Mirrors the engine's LOCAL_THRESHOLD_DEFAULT. */
      localThreshold: z.number().min(0).max(1).default(0.7),
      /** Sync the corpus snapshot when connecting to the network. */
      syncCorpus: z.boolean().default(true),
    })
    .default({ localRouting: true, localThreshold: 0.7, syncCorpus: true }),
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
  fincept: { baseUrl: FINCEPT_API_URL, seedByDefault: true },
  chat: { generation: "cloud", storage: "cloud" },
  knowledge: { localRouting: true, localThreshold: 0.7, syncCorpus: true },
}
