import { describe, expect, test } from "bun:test"
import { composeSystemPrompt } from "@core/agent/compose-system"

describe("composeSystemPrompt", () => {
  test("base only when no agent or extras", () => {
    expect(composeSystemPrompt({ base: "BASE" })).toBe("BASE")
  })

  test("appends optional blocks in order", () => {
    expect(composeSystemPrompt({ base: "BASE", memory: "MEM", skills: "SKILLS", plugins: "PLG" })).toBe(
      "BASE\n\nMEM\n\nSKILLS\n\nPLG",
    )
  })

  test("append-mode agent layers persona after the base blocks", () => {
    const agent = { name: "trader", description: "d", systemPrompt: "PERSONA" }
    expect(composeSystemPrompt({ base: "BASE", memory: "MEM", agent })).toBe(
      "BASE\n\nMEM\n\n# Active persona: trader\n\nPERSONA",
    )
  })

  test("replace-mode agent returns only its persona", () => {
    const agent = { name: "trader", description: "d", systemPrompt: "PERSONA", mode: "replace" as const }
    expect(composeSystemPrompt({ base: "BASE", memory: "MEM", agent })).toBe("PERSONA")
  })

  test("skips empty / undefined blocks", () => {
    expect(composeSystemPrompt({ base: "BASE", memory: "", skills: undefined })).toBe("BASE")
  })
})
