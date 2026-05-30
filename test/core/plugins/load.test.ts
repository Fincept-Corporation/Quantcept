import { describe, expect, test } from "bun:test"
import path from "node:path"
import { detectPluginFormat } from "@core/plugins/detect"
import { loadPluginFromDir } from "@core/plugins/load"

const FIX = path.join(import.meta.dir, "..", "..", "fixtures", "plugins")

describe("detectPluginFormat", () => {
  test("detects each on-disk format and null when absent", async () => {
    expect((await detectPluginFormat(path.join(FIX, "neutral-sample")))?.format).toBe("neutral")
    expect((await detectPluginFormat(path.join(FIX, "claude-sample")))?.format).toBe("claude")
    expect((await detectPluginFormat(path.join(FIX, "gemini-sample")))?.format).toBe("gemini")
    expect(await detectPluginFormat(path.join(FIX, "does-not-exist"))).toBeNull()
  })
})

describe("loadPluginFromDir — neutral", () => {
  test("loads skills, commands, agents, hooks, and interpolated MCP", async () => {
    const dir = path.join(FIX, "neutral-sample")
    const p = await loadPluginFromDir(dir)
    expect(p.format).toBe("neutral")
    expect(p.name).toBe("neutral-sample")
    expect(p.skills.map((s) => s.name)).toContain("greet")
    expect(p.commands.map((c) => c.name)).toContain("hi")
    expect(p.agents.map((a) => a.name)).toContain("helper")
    expect(p.hooks.SessionStart?.length).toBe(1)
    const srv = p.mcpServers["neutral-sample__echo"]
    expect(srv?.type).toBe("stdio")
    const args = (srv as { args?: string[] }).args ?? []
    expect(args[0]).toContain("server.js")
    expect(args[0]!.startsWith(dir)).toBe(true)
  })
})

describe("loadPluginFromDir — claude", () => {
  test("maps the Claude manifest + http/sse MCP shapes", async () => {
    const dir = path.join(FIX, "claude-sample")
    const p = await loadPluginFromDir(dir)
    expect(p.format).toBe("claude")
    expect(p.commands.map((c) => c.name)).toContain("c")
    expect(p.skills.map((s) => s.name)).toContain("s")
    expect(p.agents.map((a) => a.name)).toContain("a")
    expect(p.mcpServers["claude-sample__remote"]?.type).toBe("http")
    const sse = p.mcpServers["claude-sample__events"]
    expect(sse?.type).toBe("http")
    expect((sse as { transport?: string }).transport).toBe("sse")
  })
})

describe("loadPluginFromDir — gemini", () => {
  test("adapts TOML commands, context file, and sse MCP", async () => {
    const dir = path.join(FIX, "gemini-sample")
    const p = await loadPluginFromDir(dir)
    expect(p.format).toBe("gemini")
    const cmd = p.commands.find((c) => c.name === "hello")
    expect(cmd?.body).toContain("$ARGUMENTS") // {{args}} translated to our placeholder
    expect(p.contextText).toContain("Gemini context")
    const g = p.mcpServers["gemini-sample__g"]
    expect(g?.type).toBe("http")
    expect((g as { transport?: string }).transport).toBe("sse")
  })
})
