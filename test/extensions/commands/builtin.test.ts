import { describe, expect, test } from "bun:test"
import { builtinCommands } from "@ext/commands/builtin"

describe("builtinCommands", () => {
  test("includes help, new, theme, quit with unique ids", () => {
    const cmds = builtinCommands()
    const names = cmds.map((c) => c.name)
    expect(names).toContain("help")
    expect(names).toContain("new")
    expect(names).toContain("theme")
    expect(names).toContain("quit")
    const ids = cmds.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  test("help is an action command", () => {
    const help = builtinCommands().find((c) => c.name === "help")!
    expect(help.kind).toBe("action")
  })
})
