import { describe, expect, test } from "bun:test"
import { pluginCacheDir, pluginsDir, pluginStateFile } from "@core/config/paths"
import { ConfigSchema, defaultConfig } from "@core/config/schema"

describe("plugin paths", () => {
  test("plugin cache + state nest under the plugins dir", () => {
    expect(pluginCacheDir().startsWith(pluginsDir())).toBe(true)
    expect(pluginStateFile().startsWith(pluginsDir())).toBe(true)
  })
})

describe("plugins config block", () => {
  test("defaultConfig carries a plugins block", () => {
    expect(defaultConfig.plugins).toBeDefined()
  })

  test("schema fills plugin defaults", () => {
    const c = ConfigSchema.parse({ provider: { id: "anthropic-messages", model: "m", baseUrl: "u" } })
    expect(typeof c.plugins.defaultMarketplace).toBe("string")
    expect(c.plugins.autoUpdate).toBe(false)
  })
})
