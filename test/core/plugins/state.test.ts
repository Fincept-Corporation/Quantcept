import { describe, expect, test } from "bun:test"
import { type InstalledPlugin, type KnownMarketplace, PluginStateStore } from "@core/plugins/state"
import { QuantceptError } from "@shared/errors"
import fs from "fs"
import os from "os"
import path from "path"

function tmpFile(): string {
  return path.join(os.tmpdir(), `plugin-state-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
}

const mkt: KnownMarketplace = { name: "acme", source: { source: "github", repo: "acme/registry" } }

function installed(name: string, enabled = true): InstalledPlugin {
  return {
    name,
    source: { source: "github", repo: `acme/${name}` },
    marketplace: "acme",
    version: "1.0.0",
    dir: `/plugins/${name}`,
    enabled,
  }
}

describe("PluginStateStore", () => {
  test("missing file reads as empty state", () => {
    const store = new PluginStateStore(path.join(os.tmpdir(), "does-not-exist-pq", "state.json"))
    expect(store.read()).toEqual({ marketplaces: {}, installed: {} })
  })

  test("addMarketplace then listMarketplaces", () => {
    const file = tmpFile()
    try {
      const store = new PluginStateStore(file)
      store.addMarketplace(mkt)
      expect(store.listMarketplaces()).toEqual([mkt])
      expect(store.read().marketplaces.acme).toEqual(mkt)
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  test("removeMarketplace drops it", () => {
    const file = tmpFile()
    try {
      const store = new PluginStateStore(file)
      store.addMarketplace(mkt)
      store.removeMarketplace("acme")
      expect(store.listMarketplaces()).toEqual([])
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  test("setInstalled then listInstalled", () => {
    const file = tmpFile()
    try {
      const store = new PluginStateStore(file)
      const p = installed("widget")
      store.setInstalled(p)
      expect(store.listInstalled()).toEqual([p])
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  test("removeInstalled drops it", () => {
    const file = tmpFile()
    try {
      const store = new PluginStateStore(file)
      store.setInstalled(installed("widget"))
      store.removeInstalled("widget")
      expect(store.listInstalled()).toEqual([])
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  test("setEnabled(name,false) removes it from enabledNames", () => {
    const file = tmpFile()
    try {
      const store = new PluginStateStore(file)
      store.setInstalled(installed("a"))
      store.setInstalled(installed("b"))
      expect(store.enabledNames().sort()).toEqual(["a", "b"])
      store.setEnabled("a", false)
      expect(store.enabledNames()).toEqual(["b"])
      store.setEnabled("a", true)
      expect(store.enabledNames().sort()).toEqual(["a", "b"])
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  test("setEnabled throws QuantceptError when not installed", () => {
    const file = tmpFile()
    try {
      const store = new PluginStateStore(file)
      expect(() => store.setEnabled("ghost", true)).toThrow(QuantceptError)
      try {
        store.setEnabled("ghost", true)
      } catch (e) {
        expect((e as QuantceptError).code).toBe("PLUGIN")
      }
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  test("persists across a second store instance on the same file", () => {
    const file = tmpFile()
    try {
      const a = new PluginStateStore(file)
      a.addMarketplace(mkt)
      a.setInstalled(installed("widget"))
      const b = new PluginStateStore(file)
      expect(b.listMarketplaces()).toEqual([mkt])
      expect(b.listInstalled()).toEqual([installed("widget")])
      expect(b.enabledNames()).toEqual(["widget"])
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  test("corrupt file reads as empty state (no throw)", () => {
    const file = tmpFile()
    try {
      fs.writeFileSync(file, "{bad")
      const store = new PluginStateStore(file)
      expect(store.read()).toEqual({ marketplaces: {}, installed: {} })
    } finally {
      fs.rmSync(file, { force: true })
    }
  })
})
