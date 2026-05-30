import { describe, expect, test } from "bun:test"
import type { HookInput, HookOutcome, HookRunner } from "@core/hooks/types"
import { executeTool, type ExecutorContext } from "@core/tools/executor"
import { buildTool } from "@core/tools/Tool"
import { z } from "zod/v4"

const baseCtx: Omit<ExecutorContext, "hooks"> = {
  mode: "ask",
  cwd: ".",
  abort: new AbortController().signal,
  ask: async () => "allow",
}

function recordingHooks(events: string[], pre?: Partial<HookOutcome>): HookRunner {
  return {
    fire: async (i: HookInput): Promise<HookOutcome> => {
      events.push(i.event)
      if (i.event === "PreToolUse" && pre) return { blocked: false, additionalContext: [], ...pre }
      return { blocked: false, additionalContext: [] }
    },
  }
}

describe("executeTool hooks", () => {
  test("fires PreToolUse before, and PostToolUse after, an allowed tool", async () => {
    const events: string[] = []
    const tool = buildTool({
      name: "demo",
      description: "d",
      inputSchema: z.object({ x: z.number() }),
      isReadOnly: () => true,
      call: async () => {
        events.push("call")
        return { output: "ok" }
      },
    })
    const r = await executeTool(tool, { x: 1 }, { ...baseCtx, hooks: recordingHooks(events) })
    expect(r.isError).toBeFalsy()
    expect(events).toEqual(["PreToolUse", "call", "PostToolUse"])
  })

  test("a PreToolUse block denies the tool before it runs", async () => {
    const events: string[] = []
    const tool = buildTool({
      name: "demo",
      description: "d",
      inputSchema: z.object({}),
      isReadOnly: () => true,
      call: async () => {
        events.push("call")
        return { output: "ran" }
      },
    })
    const hooks: HookRunner = {
      fire: async (i) =>
        i.event === "PreToolUse"
          ? { blocked: true, reason: "nope", additionalContext: [] }
          : { blocked: false, additionalContext: [] },
    }
    const r = await executeTool(tool, {}, { ...baseCtx, hooks })
    expect(r.isError).toBe(true)
    expect(r.output).toContain("nope")
    expect(events).not.toContain("call")
  })
})
