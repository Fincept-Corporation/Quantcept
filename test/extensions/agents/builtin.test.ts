import { describe, expect, test } from "bun:test"
import path from "path"
import { discoverAgents } from "@core/agent/agents"

const BUILTIN = path.join(import.meta.dir, "..", "..", "..", "src", "extensions", "agents", "builtin")

describe("built-in agents", () => {
  test("ships the finance personas", async () => {
    const agents = await discoverAgents({ builtinDir: BUILTIN, userDir: "/no-such-user-x", projectDir: "/no-such-project-y" })
    const names = agents.map((a) => a.name)
    for (const n of [
      "analyst", "trader", "risk-manager", "quant",
      "macro-strategist", "portfolio-manager", "value-investor", "devils-advocate",
    ]) {
      expect(names).toContain(n)
    }
  })
})
