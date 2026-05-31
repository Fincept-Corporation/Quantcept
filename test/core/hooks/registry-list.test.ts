import { describe, expect, test } from "bun:test"
import { HookRegistry } from "@core/hooks/registry"

describe("HookRegistry.list", () => {
  test("enumerates sources with their populated events (in lifecycle order) + hook counts", () => {
    const r = new HookRegistry()
    r.add("plugA", {
      PreToolUse: [{ hooks: [{ type: "command", command: "a" }, { type: "command", command: "b" }] }],
      SessionStart: [{ hooks: [{ type: "command", command: "c" }] }],
    })
    r.add("plugB", {})
    expect(r.list()).toEqual([
      { source: "plugA", events: ["SessionStart", "PreToolUse"], count: 3 },
      { source: "plugB", events: [], count: 0 },
    ])
  })

  test("empty registry lists nothing", () => {
    expect(new HookRegistry().list()).toEqual([])
  })
})
