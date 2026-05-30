import fs from "node:fs"
import { describe, expect, test } from "bun:test"
import { pluginCacheDir } from "@core/config/paths"
import { ensurePluginCacheDir, pluginCachePath } from "@core/plugins/cache"

describe("pluginCachePath", () => {
  test("nests under the plugin cache dir", () => {
    const p = pluginCachePath({ marketplace: "mk", plugin: "p", version: "1.0.0" })
    expect(p.startsWith(pluginCacheDir())).toBe(true)
  })

  test("includes plugin + version segments", () => {
    const p = pluginCachePath({ marketplace: "mk", plugin: "my-plugin", version: "2.1.0" })
    expect(p.includes("my-plugin")).toBe(true)
    expect(p.includes("2.1.0")).toBe(true)
  })

  test("defaults marketplace to _local and version to unknown", () => {
    const p = pluginCachePath({ plugin: "p" })
    expect(p.includes("_local")).toBe(true)
    expect(p.includes("unknown")).toBe(true)
  })

  test("sanitizes a / inside a version to -", () => {
    const p = pluginCachePath({ marketplace: "mk", plugin: "p", version: "feature/x" })
    expect(p.includes("feature/x")).toBe(false)
    expect(p.includes("feature-x")).toBe(true)
  })

  test("sanitizes other illegal chars in marketplace + plugin", () => {
    const p = pluginCachePath({ marketplace: "a b", plugin: "p@1", version: "1" })
    expect(p.includes("a-b")).toBe(true)
    expect(p.includes("p-1")).toBe(true)
  })
})

describe("ensurePluginCacheDir", () => {
  test("mkdir -p's the path and returns it", async () => {
    const plugin = `test-${process.pid}`
    const result = await ensurePluginCacheDir({ marketplace: "mk", plugin, version: "1.0.0" })
    try {
      expect(result).toBe(pluginCachePath({ marketplace: "mk", plugin, version: "1.0.0" }))
      expect(fs.existsSync(result)).toBe(true)
    } finally {
      fs.rmSync(result, { recursive: true, force: true })
    }
  })
})
