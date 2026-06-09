import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { loadAgentFromFile } from "@core/agent/agent-load"
import path from "path"

describe("agent loader", () => {
  test("loads the analyst agent definition", async () => {
    const file = path.join(import.meta.dir, "../../../src/extensions/agents/builtin/analyst.md")
    const agent = await loadAgentFromFile(file)
    expect(agent.name).toBe("analyst")
    expect(agent.systemPrompt.length).toBeGreaterThan(0)
  })

  test("parses CRLF (Windows) line endings", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "qc-agent-crlf-"))
    const file = path.join(dir, "winagent.md")
    // A file hand-authored in a Windows editor (Notepad / default VS Code) uses CRLF.
    const content = ["---", "name: winagent", "description: a windows agent", "---", "", "You help with things."].join(
      "\r\n",
    )
    await Bun.write(file, content)
    const agent = await loadAgentFromFile(file)
    expect(agent.name).toBe("winagent")
    expect(agent.description).toBe("a windows agent")
    expect(agent.systemPrompt).toBe("You help with things.")
  })

  test("treats an empty 'model:' line as absent so the configured model is inherited", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "qc-agent-empty-"))
    const file = path.join(dir, "nomodel.md")
    const content = ["---", "name: nomodel", "description: no model set", "model:", "---", "", "Body."].join("\n")
    await Bun.write(file, content)
    const agent = await loadAgentFromFile(file)
    expect(agent.model).toBeUndefined()
  })
})
