import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pluginCachePath } from "@core/plugins/cache"
import { PluginManager } from "@core/plugins/manager"
import { PluginStateStore } from "@core/plugins/state"

const FIX = path.join(import.meta.dir, "..", "..", "fixtures", "plugins")
const stateFile = path.join(os.tmpdir(), `qc-mgr-state-${process.pid}.json`)
const cacheLeaf = pluginCachePath({ marketplace: "sample-marketplace", plugin: "neutral-sample", version: "1.0.0" })

afterAll(async () => {
  await fs.rm(stateFile, { force: true })
  // remove the whole sample-marketplace cache subtree
  await fs.rm(path.dirname(path.dirname(cacheLeaf)), { recursive: true, force: true })
})

describe("PluginManager end-to-end (local)", () => {
  test("add marketplace → install name@marketplace → enable → load contributions", async () => {
    const mgr = new PluginManager({ state: new PluginStateStore(stateFile) })

    const mp = await mgr.addMarketplace(path.join(FIX, "sample-marketplace"))
    expect(mp.name).toBe("sample-marketplace")
    expect(mgr.listMarketplaces().map((m) => m.name)).toContain("sample-marketplace")

    const installed = await mgr.install("neutral-sample@sample-marketplace")
    expect(installed.name).toBe("neutral-sample")
    expect(installed.enabled).toBe(true)

    const c = await mgr.loadEnabled()
    expect(c.skills.map((s) => s.name)).toContain("neutral-sample:greet")
    expect(c.commands.map((x) => x.name)).toContain("neutral-sample:hi")
    expect(c.agents.map((a) => a.name)).toContain("neutral-sample:helper")
    expect(c.mcpServers["neutral-sample__echo"]).toBeDefined()
    expect(c.hookRegistry.isEmpty()).toBe(false)

    // disabling drops the plugin from the next load
    mgr.disable("neutral-sample")
    const c2 = await mgr.loadEnabled()
    expect(c2.skills.length).toBe(0)
    expect(c2.plugins.length).toBe(0)
  })
})
