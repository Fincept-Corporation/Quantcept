import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { installPlugin } from "@core/plugins/install"

const FIX = path.join(import.meta.dir, "..", "..", "fixtures", "plugins")
const dest = path.join(os.tmpdir(), `qc-install-test-${process.pid}`)

afterAll(async () => {
  await fs.rm(dest, { recursive: true, force: true })
})

describe("installPlugin (local source)", () => {
  test("copies a local plugin into the destination and loads its surfaces", async () => {
    const res = await installPlugin({ source: "local", path: path.join(FIX, "neutral-sample") }, { dest })
    expect(res.dir).toBe(dest)
    expect(res.plugin.name).toBe("neutral-sample")
    expect(res.plugin.skills.map((s) => s.name)).toContain("greet")
    expect(res.plugin.commands.map((c) => c.name)).toContain("hi")
    const copied = await fs
      .stat(path.join(dest, "quantcept-plugin.json"))
      .then(() => true)
      .catch(() => false)
    expect(copied).toBe(true)
    // MCP server path interpolated against the install dir (the cache/dest), not the source.
    const args = (res.plugin.mcpServers["neutral-sample__echo"] as { args?: string[] }).args ?? []
    expect(args[0]!.startsWith(dest)).toBe(true)
  })
})
