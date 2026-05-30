import { describe, expect, test } from "bun:test"
import { ConfigSchema, defaultConfig } from "@core/config/schema"

describe("ConfigSchema", () => {
  test("accepts a minimal valid config", () => {
    const parsed = ConfigSchema.parse({ provider: { id: "anthropic-messages", model: "x", baseUrl: "u" } })
    expect(parsed.provider.model).toBe("x")
  })

  test("rejects unknown provider adapter id", () => {
    expect(() => ConfigSchema.parse({ provider: { id: "bogus", model: "x", baseUrl: "u" } })).toThrow()
  })

  test("defaultConfig parses against the schema", () => {
    expect(() => ConfigSchema.parse(defaultConfig)).not.toThrow()
  })
})

describe("ConfigSchema mcp field", () => {
  test("defaults mcp to empty servers", () => {
    const c = ConfigSchema.parse({
      provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
    })
    expect(c.mcp).toEqual({ servers: {} })
  })
  test("defaultConfig includes an empty mcp", () => {
    expect(defaultConfig.mcp).toEqual({ servers: {} })
  })
})

describe("ConfigSchema permissions.rules", () => {
  test("defaults rules to empty array", () => {
    const c = ConfigSchema.parse({ provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" } })
    expect(c.permissions.rules).toEqual([])
  })
  test("parses rules with action enum", () => {
    const c = ConfigSchema.parse({
      provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
      permissions: { rules: [{ permission: "shell", pattern: "git *", action: "allow" }] },
    })
    expect(c.permissions.rules[0].action).toBe("allow")
  })
  test("rejects an invalid action", () => {
    expect(() =>
      ConfigSchema.parse({
        provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
        permissions: { rules: [{ permission: "shell", pattern: "x", action: "bogus" }] },
      }),
    ).toThrow()
  })
  test("defaultConfig includes empty rules", () => {
    expect(defaultConfig.permissions.rules).toEqual([])
  })
})

describe("ConfigSchema scheduler", () => {
  test("defaults scheduler when absent", () => {
    const c = ConfigSchema.parse({ provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" } })
    expect(c.scheduler).toEqual({
      defaultExchange: "XNYS",
      timezone: "America/New_York",
      maxStalenessSeconds: 3600,
      defaultMissedPolicy: "skip",
    })
  })
  test("rejects a negative maxStalenessSeconds", () => {
    expect(() =>
      ConfigSchema.parse({
        provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
        scheduler: { maxStalenessSeconds: -1 },
      }),
    ).toThrow()
  })
  test("rejects an unknown missed policy", () => {
    expect(() =>
      ConfigSchema.parse({
        provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
        scheduler: { defaultMissedPolicy: "bogus" },
      }),
    ).toThrow()
  })
  test("defaultConfig includes scheduler defaults", () => {
    expect(defaultConfig.scheduler).toEqual({
      defaultExchange: "XNYS",
      timezone: "America/New_York",
      maxStalenessSeconds: 3600,
      defaultMissedPolicy: "skip",
    })
  })
})

describe("ConfigSchema risk", () => {
  test("defaults risk with startingCash 100_000 and no limits set", () => {
    const c = ConfigSchema.parse({ provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" } })
    expect(c.risk.startingCash).toBe(100_000)
    expect(c.risk.maxOrderNotional).toBeUndefined()
    expect(c.risk.maxDailyLossUsd).toBeUndefined()
    expect(c.risk.maxDrawdownPct).toBeUndefined()
    expect(c.risk.maxPositionQtyPerSymbol).toBeUndefined()
  })
  test("parses configured risk limits", () => {
    const c = ConfigSchema.parse({
      provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
      risk: { startingCash: 50_000, maxOrderNotional: 10_000, maxDrawdownPct: 20, maxPositionQtyPerSymbol: 100 },
    })
    expect(c.risk.startingCash).toBe(50_000)
    expect(c.risk.maxOrderNotional).toBe(10_000)
    expect(c.risk.maxDrawdownPct).toBe(20)
    expect(c.risk.maxPositionQtyPerSymbol).toBe(100)
  })
  test("rejects a negative startingCash", () => {
    expect(() =>
      ConfigSchema.parse({
        provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
        risk: { startingCash: -1 },
      }),
    ).toThrow()
  })
  test("rejects a non-positive maxOrderNotional", () => {
    expect(() =>
      ConfigSchema.parse({
        provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
        risk: { maxOrderNotional: 0 },
      }),
    ).toThrow()
  })
  test("defaultConfig includes risk defaults", () => {
    expect(defaultConfig.risk).toEqual({ startingCash: 100_000 })
  })
})

describe("ConfigSchema broker", () => {
  test("defaults broker to paper with 5bps slippage and no seed prices", () => {
    const c = ConfigSchema.parse({ provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" } })
    expect(c.broker.kind).toBe("paper")
    expect(c.broker.slippageBps).toBe(5)
    expect(c.broker.prices).toBeUndefined()
  })
  test("parses seed prices for the paper broker", () => {
    const c = ConfigSchema.parse({
      provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
      broker: { slippageBps: 10, prices: { AAPL: 150, MSFT: 400 } },
    })
    expect(c.broker.slippageBps).toBe(10)
    expect(c.broker.prices).toEqual({ AAPL: 150, MSFT: 400 })
  })
  test("rejects an unknown broker kind", () => {
    expect(() =>
      ConfigSchema.parse({
        provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
        broker: { kind: "live" },
      }),
    ).toThrow()
  })
  test("rejects a negative slippageBps", () => {
    expect(() =>
      ConfigSchema.parse({
        provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
        broker: { slippageBps: -1 },
      }),
    ).toThrow()
  })
  test("rejects a non-positive seed price", () => {
    expect(() =>
      ConfigSchema.parse({
        provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
        broker: { prices: { AAPL: 0 } },
      }),
    ).toThrow()
  })
  test("defaultConfig includes broker defaults", () => {
    expect(defaultConfig.broker).toEqual({ kind: "paper", slippageBps: 5 })
  })
})

describe("ConfigSchema trading", () => {
  test("defaults trading to disabled (autonomous trading OFF by default)", () => {
    const c = ConfigSchema.parse({ provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" } })
    expect(c.trading).toEqual({ enabled: false })
  })
  test("parses trading.enabled when set", () => {
    const c = ConfigSchema.parse({
      provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
      trading: { enabled: true },
    })
    expect(c.trading.enabled).toBe(true)
  })
  test("defaultConfig includes trading disabled", () => {
    expect(defaultConfig.trading).toEqual({ enabled: false })
  })
})

describe("ConfigSchema visionProvider", () => {
  test("is optional and absent by default", () => {
    const c = ConfigSchema.parse({ provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" } })
    expect(c.visionProvider).toBeUndefined()
  })

  test("parses a configured vision provider and applies provider defaults", () => {
    const c = ConfigSchema.parse({
      provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
      visionProvider: {
        id: "anthropic-messages",
        model: "claude-opus-4-8",
        baseUrl: "https://api.anthropic.com",
        apiKey: "k",
      },
    })
    expect(c.visionProvider?.model).toBe("claude-opus-4-8")
    expect(c.visionProvider?.maxTokens).toBe(8192) // ProviderConfig defaults applied
  })

  test("rejects an invalid vision provider id", () => {
    expect(() =>
      ConfigSchema.parse({
        provider: { id: "anthropic-messages", model: "m", baseUrl: "https://x" },
        visionProvider: { id: "bogus", model: "m", baseUrl: "u" },
      }),
    ).toThrow()
  })
})
