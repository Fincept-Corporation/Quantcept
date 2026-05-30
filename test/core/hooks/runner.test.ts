import { describe, expect, test } from "bun:test"
import type { HookCommand, HookEvent, HookInput } from "@core/hooks/types"
import { type HookSpawnFn, runHooks } from "@core/hooks/runner"

/** A one-event fake registry. `forEvent` returns `cmds` for `event`, else []. */
function fakeRegistry(event: HookEvent, cmds: HookCommand[]) {
  return {
    forEvent(e: HookEvent, _toolName?: string): HookCommand[] {
      return e === event ? cmds : []
    },
  }
}

const cmd = (command: string, timeout?: number): HookCommand => ({ type: "command", command, timeout })

const input: HookInput = { event: "UserPromptSubmit", cwd: "/work", prompt: "hi" }

describe("runHooks", () => {
  test("aggregates additionalContext from a passing hook (blocked false)", async () => {
    const spawn: HookSpawnFn = async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ additionalContext: "hi" }),
      stderr: "",
    })
    const outcome = await runHooks(fakeRegistry("UserPromptSubmit", [cmd("c")]), input, { spawn })
    expect(outcome.blocked).toBe(false)
    expect(outcome.additionalContext).toContain("hi")
  })

  test("exitCode 2 blocks; reason falls back to stderr", async () => {
    const spawn: HookSpawnFn = async () => ({ exitCode: 2, stdout: "", stderr: "nope" })
    const outcome = await runHooks(fakeRegistry("UserPromptSubmit", [cmd("c")]), input, { spawn })
    expect(outcome.blocked).toBe(true)
    expect(outcome.reason).toBe("nope")
  })

  test("decision=block blocks with its reason", async () => {
    const spawn: HookSpawnFn = async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ decision: "block", reason: "no" }),
      stderr: "",
    })
    const outcome = await runHooks(fakeRegistry("UserPromptSubmit", [cmd("c")]), input, { spawn })
    expect(outcome.blocked).toBe(true)
    expect(outcome.reason).toBe("no")
  })

  test("no hooks for the event → no spawn, empty outcome", async () => {
    let called = false
    const spawn: HookSpawnFn = async () => {
      called = true
      return { exitCode: 0, stdout: "", stderr: "" }
    }
    const outcome = await runHooks(fakeRegistry("Stop", [cmd("c")]), input, { spawn })
    expect(called).toBe(false)
    expect(outcome.blocked).toBe(false)
    expect(outcome.additionalContext).toEqual([])
  })

  test("passes serialized input on stdin and forwards command/cwd/timeout to spawn", async () => {
    const seen: Array<{ command: string; stdin: string; cwd: string; timeoutMs?: number }> = []
    const spawn: HookSpawnFn = async (command, opts) => {
      seen.push({ command, stdin: opts.stdin, cwd: opts.cwd, timeoutMs: opts.timeoutMs })
      return { exitCode: 0, stdout: "", stderr: "" }
    }
    await runHooks(fakeRegistry("UserPromptSubmit", [cmd("run-me", 500)]), input, { spawn })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.command).toBe("run-me")
    expect(seen[0]?.cwd).toBe("/work")
    expect(seen[0]?.timeoutMs).toBe(500)
    expect(JSON.parse(seen[0]?.stdin ?? "{}")).toMatchObject({ event: "UserPromptSubmit", prompt: "hi" })
  })

  test("ignores invalid JSON stdout → treated as empty output", async () => {
    const spawn: HookSpawnFn = async () => ({ exitCode: 0, stdout: "not json{", stderr: "" })
    const outcome = await runHooks(fakeRegistry("UserPromptSubmit", [cmd("c")]), input, { spawn })
    expect(outcome.blocked).toBe(false)
    expect(outcome.additionalContext).toEqual([])
  })

  test("runs multiple hooks in order; collects all context; first block wins reason", async () => {
    const outs = [
      { exitCode: 0, stdout: JSON.stringify({ additionalContext: "a" }), stderr: "" },
      { exitCode: 0, stdout: JSON.stringify({ decision: "block", reason: "stop1" }), stderr: "" },
      { exitCode: 2, stdout: "", stderr: "stop2" },
      { exitCode: 0, stdout: JSON.stringify({ additionalContext: "b" }), stderr: "" },
    ]
    let i = 0
    const spawn: HookSpawnFn = async () => outs[i++] ?? { exitCode: 0, stdout: "", stderr: "" }
    const reg = fakeRegistry("UserPromptSubmit", [cmd("1"), cmd("2"), cmd("3"), cmd("4")])
    const outcome = await runHooks(reg, input, { spawn })
    expect(outcome.blocked).toBe(true)
    expect(outcome.reason).toBe("stop1")
    expect(outcome.additionalContext).toEqual(["a", "b"])
  })

  test("drops empty/whitespace additionalContext strings", async () => {
    const outs = [
      { exitCode: 0, stdout: JSON.stringify({ additionalContext: "" }), stderr: "" },
      { exitCode: 0, stdout: JSON.stringify({ additionalContext: "keep" }), stderr: "" },
    ]
    let i = 0
    const spawn: HookSpawnFn = async () => outs[i++] ?? { exitCode: 0, stdout: "", stderr: "" }
    const outcome = await runHooks(fakeRegistry("UserPromptSubmit", [cmd("1"), cmd("2")]), input, { spawn })
    expect(outcome.additionalContext).toEqual(["keep"])
  })
})
