import { describe, expect, test, beforeEach } from "bun:test"
import { tmpdir } from "os"
import path from "path"
import { mkdtempSync } from "fs"
import { CreateAgentTool } from "@core/tools/builtin/CreateAgentTool"
import { loadAgentFromFile } from "@core/agent/agent-load"

const ctxOf = (cwd: string) => ({ abort: new AbortController().signal, cwd })

describe("CreateAgentTool", () => {
  let cwd: string
  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), "qc-create-agent-"))
  })

  test("is destructive (write effect → asks)", () => {
    expect(CreateAgentTool.isDestructive({ name: "x", description: "d", systemPrompt: "p" })).toBe(true)
  })

  test("writes a valid, loadable agent file and slugs the name (project scope)", async () => {
    const r = await CreateAgentTool.call(
      { name: "My Trader!", description: "short term", systemPrompt: "You trade.", scope: "project" },
      ctxOf(cwd),
    )
    expect(r.isError).toBeFalsy()
    const loaded = await loadAgentFromFile(path.join(cwd, ".quantcept", "agents", "my-trader.md"))
    expect(loaded.name).toBe("my-trader")
    expect(loaded.description).toBe("short term")
    expect(loaded.systemPrompt).toBe("You trade.")
  })

  test("rejects a duplicate without overwrite", async () => {
    const input = { name: "dup", description: "d", systemPrompt: "p", scope: "project" as const }
    await CreateAgentTool.call(input, ctxOf(cwd))
    const r2 = await CreateAgentTool.call(input, ctxOf(cwd))
    expect(r2.isError).toBe(true)
  })

  test("persists model and mode in frontmatter", async () => {
    await CreateAgentTool.call(
      { name: "quanty", description: "d", systemPrompt: "p", model: "x-model", mode: "replace", scope: "project" },
      ctxOf(cwd),
    )
    const loaded = await loadAgentFromFile(path.join(cwd, ".quantcept", "agents", "quanty.md"))
    expect(loaded.model).toBe("x-model")
    expect(loaded.mode).toBe("replace")
  })

  test("rejects a name that slugs to empty", async () => {
    const r = await CreateAgentTool.call({ name: "!!!", description: "d", systemPrompt: "p", scope: "project" }, ctxOf(cwd))
    expect(r.isError).toBe(true)
  })

  test("round-trips a systemPrompt that contains a '---' line (no truncation)", async () => {
    const body = "You are an analyst.\n---\nAlways cite sources."
    await CreateAgentTool.call({ name: "hr", description: "d", systemPrompt: body, scope: "project" }, ctxOf(cwd))
    const loaded = await loadAgentFromFile(path.join(cwd, ".quantcept", "agents", "hr.md"))
    expect(loaded.systemPrompt).toBe(body)
  })

  test("sanitizes a model containing a newline so it can't inject frontmatter", async () => {
    await CreateAgentTool.call(
      { name: "inj", description: "d", systemPrompt: "p", model: "m\nmode: replace", scope: "project" },
      ctxOf(cwd),
    )
    const loaded = await loadAgentFromFile(path.join(cwd, ".quantcept", "agents", "inj.md"))
    expect(loaded.model).toBe("m mode: replace")
    // The injected `mode:` must NOT have become a real frontmatter field.
    expect(loaded.mode).toBeUndefined()
  })

  test("rejects a description that is only whitespace (would write an unloadable file)", async () => {
    const r = await CreateAgentTool.call({ name: "ws", description: "   ", systemPrompt: "p", scope: "project" }, ctxOf(cwd))
    expect(r.isError).toBe(true)
  })
})
