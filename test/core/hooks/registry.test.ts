import { describe, expect, test } from "bun:test"
import type { HookConfig } from "@core/hooks/types"
import { HookRegistry } from "@core/hooks/registry"

const cfg: HookConfig = {
  PreToolUse: [{ matcher: "write|edit", hooks: [{ type: "command", command: "pre" }] }],
  SessionStart: [{ hooks: [{ type: "command", command: "start" }] }],
}

describe("HookRegistry", () => {
  test("isEmpty true initially", () => {
    expect(new HookRegistry().isEmpty()).toBe(true)
  })

  test("matcher group matches when toolName satisfies the regex", () => {
    const r = new HookRegistry()
    r.add("plugin-a", cfg)
    expect(r.forEvent("PreToolUse", "write").map((h) => h.command)).toEqual(["pre"])
  })

  test("matcher group does not match a non-matching toolName", () => {
    const r = new HookRegistry()
    r.add("plugin-a", cfg)
    expect(r.forEvent("PreToolUse", "read")).toEqual([])
  })

  test("matcher group never matches when toolName is undefined", () => {
    const r = new HookRegistry()
    r.add("plugin-a", cfg)
    expect(r.forEvent("PreToolUse")).toEqual([])
  })

  test("matcher-less group always matches", () => {
    const r = new HookRegistry()
    r.add("plugin-a", cfg)
    expect(r.forEvent("SessionStart").map((h) => h.command)).toEqual(["start"])
  })

  test("event with no registered groups yields []", () => {
    const r = new HookRegistry()
    r.add("plugin-a", cfg)
    expect(r.forEvent("Stop")).toEqual([])
  })

  test("flattens across sources in insertion order", () => {
    const r = new HookRegistry()
    r.add("a", { SessionStart: [{ hooks: [{ type: "command", command: "a1" }] }] })
    r.add("b", { SessionStart: [{ hooks: [{ type: "command", command: "b1" }] }] })
    expect(r.forEvent("SessionStart").map((h) => h.command)).toEqual(["a1", "b1"])
  })

  test("remove(source) drops only that source", () => {
    const r = new HookRegistry()
    r.add("a", { SessionStart: [{ hooks: [{ type: "command", command: "a1" }] }] })
    r.add("b", { SessionStart: [{ hooks: [{ type: "command", command: "b1" }] }] })
    r.remove("a")
    expect(r.forEvent("SessionStart").map((h) => h.command)).toEqual(["b1"])
    expect(r.isEmpty()).toBe(false)
  })

  test("add then remove leaves the registry empty", () => {
    const r = new HookRegistry()
    r.add("plugin-a", cfg)
    expect(r.isEmpty()).toBe(false)
    r.remove("plugin-a")
    expect(r.isEmpty()).toBe(true)
  })
})
