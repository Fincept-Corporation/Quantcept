import { describe, expect, test } from "bun:test"
import path from "node:path"
import { loadPluginFromDir } from "@core/plugins/load"
import { readMarketplaceDir } from "@core/plugins/registry-client"

const EXAMPLES = path.join(import.meta.dir, "..", "..", "..", "src", "extensions", "plugins", "examples")

describe("bundled example plugin", () => {
  test("quantcept-sample loads every surface", async () => {
    const p = await loadPluginFromDir(path.join(EXAMPLES, "quantcept-sample"))
    expect(p.name).toBe("quantcept-sample")
    expect(p.format).toBe("neutral")
    expect(p.skills.map((s) => s.name)).toContain("portfolio-tip")
    expect(p.commands.map((c) => c.name)).toContain("greet")
    expect(p.agents.map((a) => a.name)).toContain("quant-helper")
    expect(p.hooks.SessionStart?.length).toBeGreaterThan(0)
    expect(p.mcpServers["quantcept-sample__echo"]?.type).toBe("stdio")
  })
})

describe("bundled example marketplace", () => {
  test("quantcept-examples lists the sample plugin with a resolved local source", async () => {
    const mp = await readMarketplaceDir(path.join(EXAMPLES, "local-marketplace"))
    expect(mp.name).toBe("quantcept-examples")
    const entry = mp.plugins.find((p) => p.name === "quantcept-sample")
    expect(entry).toBeDefined()
    expect((entry!.source as { source: string }).source).toBe("local")
  })
})
