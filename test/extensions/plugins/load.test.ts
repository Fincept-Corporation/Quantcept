import { describe, expect, test } from "bun:test"
import { loadPluginFromDir } from "@ext/plugins/load"
import path from "path"

describe("plugin loader", () => {
  test("loads the sample plugin manifest and its skill", async () => {
    const dir = path.join(import.meta.dir, "../../../src/extensions/plugins/examples/sample-plugin")
    const plugin = await loadPluginFromDir(dir)
    expect(plugin.manifest.name).toBe("sample-plugin")
    expect(plugin.skills.length).toBe(1)
    expect(plugin.skills[0].name).toBe("hello")
  })
})
