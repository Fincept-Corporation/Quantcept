import { describe, expect, test } from "bun:test"
import { CommandRegistry } from "@ext/commands/registry"
import { helpCommand } from "@ext/commands/builtin/help"

describe("CommandRegistry", () => {
  test("registers and runs the help command", async () => {
    const r = new CommandRegistry()
    r.register(helpCommand)
    r.register({ name: "foo", description: "foo cmd", async run() { return "" } })
    const out = await r.get("help")!.run([], { registry: r })
    expect(out).toContain("foo")
    expect(out).toContain("help")
  })
})
