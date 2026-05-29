import { describe, expect, test, beforeAll } from "bun:test"
import { tmpdir } from "os"
import path from "path"
import { mkdtempSync } from "fs"
import { loadAgents } from "@core/agent/agents"

describe("loadAgents", () => {
  let dir: string
  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "qc-agents-"))
    await Bun.write(path.join(dir, "analyst.md"), "---\nname: analyst\ndescription: research\n---\nYou are an analyst.")
    await Bun.write(path.join(dir, "writer.md"), "---\nname: writer\ndescription: drafts\n---\nYou write.")
  })
  test("loads all .md agents into a map keyed by name", async () => {
    const agents = await loadAgents(dir)
    expect(agents.get("analyst")?.systemPrompt).toBe("You are an analyst.")
    expect(agents.get("writer")?.description).toBe("drafts")
    expect(agents.size).toBe(2)
  })
  test("missing dir → empty map (no throw)", async () => {
    const agents = await loadAgents(path.join(dir, "nope"))
    expect(agents.size).toBe(0)
  })
})
