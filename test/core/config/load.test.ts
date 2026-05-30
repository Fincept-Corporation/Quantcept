import { describe, expect, test } from "bun:test"
import { mergeConfig, applyEnvOverrides } from "@core/config/load"
import { defaultConfig } from "@core/config/schema"

describe("config merge", () => {
  test("project overrides user overrides default", () => {
    const merged = mergeConfig(defaultConfig, { provider: { model: "user-model" } }, { provider: { model: "proj-model" } })
    expect(merged.provider.model).toBe("proj-model")
  })

  test("env overrides win", () => {
    const merged = applyEnvOverrides(defaultConfig, {
      LLM_MODEL: "env-model",
      LLM_BASE_URL: "env-url",
      LLM_API_KEY: "env-key",
    })
    expect(merged.provider.model).toBe("env-model")
    expect(merged.provider.baseUrl).toBe("env-url")
    expect(merged.provider.apiKey).toBe("env-key")
  })

  test("OPENAI_API_KEY fills the visionProvider key when not set in config", () => {
    const cfg = { ...defaultConfig, visionProvider: { id: "openai-chat", model: "gpt-4o", baseUrl: "https://api.openai.com/v1", maxTokens: 1024, temperature: 0 } as const }
    const merged = applyEnvOverrides(cfg, { OPENAI_API_KEY: "sk-vision" })
    expect(merged.visionProvider?.apiKey).toBe("sk-vision")
  })
})
