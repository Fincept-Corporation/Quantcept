import { describe, expect, test } from "bun:test"
import { builtinCommands } from "@ext/commands/builtin"

describe("/create-agent command", () => {
  test("is registered as a builtin", () => {
    const cmd = builtinCommands().find((c) => c.name === "create-agent")
    expect(cmd).toBeDefined()
    expect(cmd?.kind).toBe("action")
  })

  test("navigates to a fresh session when not in a session (home)", () => {
    const cmd = builtinCommands().find((c) => c.name === "create-agent")!
    let navigated: any
    const ctx: any = { inSession: () => false, navigate: (r: any) => (navigated = r) }
    if (cmd.kind === "action") cmd.run("", ctx)
    expect(navigated.type).toBe("session")
    expect(typeof navigated.initialMessage).toBe("string")
    expect(navigated.initialMessage).toContain("create_agent")
  })

  test("builds in place via submitPrompt when already in a session", () => {
    const cmd = builtinCommands().find((c) => c.name === "create-agent")!
    let submitted: string | undefined
    let navigated = false
    const ctx: any = {
      inSession: () => true,
      submitPrompt: (t: string) => {
        submitted = t
      },
      navigate: () => {
        navigated = true
      },
    }
    if (cmd.kind === "action") cmd.run("", ctx)
    expect(navigated).toBe(false)
    expect(submitted).toContain("create_agent")
  })
})

describe("/delete-agent command", () => {
  test("is registered as a builtin action", () => {
    const cmd = builtinCommands().find((c) => c.name === "delete-agent")
    expect(cmd).toBeDefined()
    expect(cmd?.kind).toBe("action")
  })
})
