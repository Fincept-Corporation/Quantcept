import { describe, expect, test } from "bun:test"
import { loadAgentFromFile } from "@core/agent/agent-load"
import path from "path"

describe("agent loader", () => {
  test("loads the analyst agent definition", async () => {
    const file = path.join(import.meta.dir, "../../../src/extensions/agents/builtin/analyst.md")
    const agent = await loadAgentFromFile(file)
    expect(agent.name).toBe("analyst")
    expect(agent.systemPrompt.length).toBeGreaterThan(0)
  })
})
