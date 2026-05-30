import { describe, expect, test } from "bun:test"
import { HookConfigSchema, normalizeHookConfig } from "@core/hooks/types"

describe("HookConfigSchema", () => {
  test("parses event → matcher groups → command hooks", () => {
    const cfg = HookConfigSchema.parse({
      PreToolUse: [{ matcher: "write|edit", hooks: [{ type: "command", command: "echo hi" }] }],
      SessionStart: [{ hooks: [{ type: "command", command: "echo start" }] }],
    })
    expect(cfg.PreToolUse?.[0]?.hooks[0]?.command).toBe("echo hi")
    expect(cfg.SessionStart?.[0]?.hooks[0]?.command).toBe("echo start")
  })

  test("rejects unknown event names", () => {
    expect(HookConfigSchema.safeParse({ Nope: [] }).success).toBe(false)
  })
})

describe("normalizeHookConfig", () => {
  test("unwraps a top-level { hooks: {...} } file shape", () => {
    const cfg = normalizeHookConfig({ hooks: { Stop: [{ hooks: [{ type: "command", command: "x" }] }] } })
    expect(cfg.Stop?.[0]?.hooks[0]?.command).toBe("x")
  })

  test("accepts a bare event map", () => {
    const cfg = normalizeHookConfig({ Stop: [{ hooks: [{ type: "command", command: "y" }] }] })
    expect(cfg.Stop?.[0]?.hooks[0]?.command).toBe("y")
  })
})
