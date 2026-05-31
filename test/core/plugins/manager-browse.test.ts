import { describe, expect, test } from "bun:test"
import { PluginManager } from "@core/plugins/manager"
import type { Marketplace } from "@core/plugins/marketplace"
import type { PluginStateStore } from "@core/plugins/state"

const catalog: Marketplace = {
  name: "acme",
  plugins: [
    { name: "p1", source: "./p1", description: "first" },
    { name: "p2", source: "./p2" },
  ],
}
const state = { listMarketplaces: () => [{ name: "acme", source: "./acme" }] } as unknown as PluginStateStore

describe("PluginManager.browseMarketplace", () => {
  test("returns the catalog for a known marketplace", async () => {
    const mgr = new PluginManager({ state, fetchMarketplace: async () => catalog })
    const mp = await mgr.browseMarketplace("acme")
    expect(mp.plugins.map((p) => p.name)).toEqual(["p1", "p2"])
  })

  test("throws for an unknown marketplace", async () => {
    const mgr = new PluginManager({ state, fetchMarketplace: async () => catalog })
    await expect(mgr.browseMarketplace("nope")).rejects.toThrow(/Unknown marketplace/)
  })
})
