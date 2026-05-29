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
