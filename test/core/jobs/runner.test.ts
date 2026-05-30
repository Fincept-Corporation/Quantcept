import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { JobStore } from "@core/jobs/store"
import { runJob } from "@core/jobs/runner"
import type { JobGovernor, JobRunnerDeps, Verdict } from "@core/jobs/runner"
import type { Job, JobTurn } from "@core/jobs/types"
import { ToolRegistry } from "@core/tools/registry"
import { buildTool } from "@core/tools/Tool"
import type { Tool } from "@core/tools/Tool"
import type { PermissionDecision } from "@core/permissions/schema"
import type { ChatMessage, ContentBlock, Provider, ChatRequest, ChatResult, StreamHandlers } from "@core/llm/types"
import { z } from "zod/v4"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake Provider that returns a simple text response (no tool use). */
function makeFakeProvider(opts: {
  inputTokens?: number
  outputTokens?: number
  text?: string
  /** Optional per-call override: index → ChatResult. Omit a call index to use defaults. */
  overrides?: Record<number, ChatResult | "throw">
}): Provider {
  let calls = 0
  const { inputTokens = 5, outputTokens = 3, text = "All done.", overrides = {} } = opts
  return {
    id: "fake",
    async chat(_req: ChatRequest, _h?: StreamHandlers): Promise<ChatResult> {
      const idx = calls++
      const override = overrides[idx]
      if (override === "throw") throw new Error(`fake provider threw on call ${idx}`)
      if (override) return override
      return { text, inputTokens, outputTokens, stopReason: "end_turn" }
    },
  }
}

const passGovernor: JobGovernor = {
  check: () => ({ ok: true }),
  recordTurn: () => {},
}

const failGovernor: JobGovernor = {
  check: () => ({ ok: false }),
  recordTurn: () => {},
}

// ---------------------------------------------------------------------------
// Fixture setup
// ---------------------------------------------------------------------------

let tmp: string
let store: JobStore

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "qc-runner-"))
  process.env.QUANTCEPT_CONFIG_DIR = tmp
  store = new JobStore()
})

afterEach(() => {
  store.close()
  delete process.env.QUANTCEPT_CONFIG_DIR
  rmSync(tmp, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runJob", () => {
  test("1. runs until the verifier says done, persisting each turn", async () => {
    store.create({ id: "j1", cwd: tmp, goal: "Summarize AAPL", maxTurns: 10 })
    const job = store.get("j1")!

    const deps: JobRunnerDeps = {
      provider: makeFakeProvider({}),
      registry: new ToolRegistry(),
      store,
      governor: passGovernor,
      async verify(_job: Job, turns: JobTurn[]): Promise<Verdict> {
        return turns.length < 2 ? { kind: "continue" } : { kind: "done" }
      },
    }

    const result = await runJob(job, deps)

    expect(result.status).toBe("done")
    const turns = store.loadTurns("j1")
    expect(turns.length).toBeGreaterThanOrEqual(2)
  })

  test("2. pauses at maxTurns when verifier always returns continue", async () => {
    store.create({ id: "j2", cwd: tmp, goal: "Run forever", maxTurns: 2 })
    const job = store.get("j2")!

    const deps: JobRunnerDeps = {
      provider: makeFakeProvider({ text: "Still going." }),
      registry: new ToolRegistry(),
      store,
      governor: passGovernor,
      async verify(): Promise<Verdict> {
        return { kind: "continue" }
      },
    }

    const result = await runJob(job, deps)

    expect(result.status).toBe("paused")
    expect(result.pauseReason).toBe("max-turns")
    const turns = store.loadTurns("j2")
    expect(turns.length).toBe(2)
  })

  test("3. pauses on budget — governor says not ok, 0 turns persisted", async () => {
    store.create({ id: "j3", cwd: tmp, goal: "Budget fail", maxTurns: 10 })
    const job = store.get("j3")!

    const deps: JobRunnerDeps = {
      provider: makeFakeProvider({}),
      registry: new ToolRegistry(),
      store,
      governor: failGovernor,
      async verify(): Promise<Verdict> {
        return { kind: "done" }
      },
    }

    const result = await runJob(job, deps)

    expect(result.status).toBe("paused")
    expect(result.pauseReason).toBe("budget")
    const turns = store.loadTurns("j3")
    expect(turns.length).toBe(0)
  })

  test("5. on resume, the first provider call receives a trailing user message (not assistant)", async () => {
    // Phase A: persist exactly one turn. The fake provider's plain-text reply becomes a
    // trailing *assistant* message in the saved transcript; provider throws on call 1 to stop.
    store.create({ id: "j5", cwd: tmp, goal: "Resume priming", maxTurns: 10 })
    const jobA = store.get("j5")!
    const depsA: JobRunnerDeps = {
      provider: makeFakeProvider({ overrides: { 1: "throw" } }),
      registry: new ToolRegistry(),
      store,
      governor: passGovernor,
      async verify(_job: Job, turns: JobTurn[]): Promise<Verdict> {
        return turns.length >= 3 ? { kind: "done" } : { kind: "continue" }
      },
    }
    try {
      await runJob(jobA, depsA)
    } catch {
      // expected: provider throws on the 2nd chat() call
    }
    // Confirm the saved transcript indeed ends on an assistant turn.
    const savedMessages = store.loadTurns("j5").at(-1)!.messages
    expect(savedMessages.at(-1)!.role).toBe("assistant")

    // Phase B: resume with a NEW store and a recording provider.
    store.close()
    const store2 = new JobStore()
    store = store2 // hand off to afterEach for cleanup

    // Snapshot a *copy* of the messages at call time: runAgentTurn mutates the array it
    // passes in (it appends the assistant reply after chat() returns), so a stored reference
    // would reflect post-call state, not what the provider actually received.
    const seen: ChatMessage[][] = []
    const recordingProvider: Provider = {
      id: "recording",
      async chat(req: ChatRequest, _h?: StreamHandlers): Promise<ChatResult> {
        seen.push([...req.messages])
        return { text: "Resumed.", inputTokens: 5, outputTokens: 3, stopReason: "end_turn" }
      },
    }
    const depsB: JobRunnerDeps = {
      provider: recordingProvider,
      registry: new ToolRegistry(),
      store: store2,
      governor: passGovernor,
      async verify(): Promise<Verdict> {
        return { kind: "done" } // one turn then stop
      },
    }
    await runJob(store2.get("j5")!, depsB)

    // The FIRST chat() of the resumed run must end on a user message.
    expect(seen.length).toBeGreaterThanOrEqual(1)
    expect(seen[0]!.at(-1)!.role).toBe("user")
  })

  test("4. resumes from the journal across a new store instance", async () => {
    // Phase A: provider throws on 2nd chat() call → runJob throws after saving 1 turn.
    store.create({ id: "j4", cwd: tmp, goal: "Incremental task", maxTurns: 10 })
    const job = store.get("j4")!

    const throwingProvider = makeFakeProvider({
      overrides: { 1: "throw" },
    })

    const depsA: JobRunnerDeps = {
      provider: throwingProvider,
      registry: new ToolRegistry(),
      store,
      governor: passGovernor,
      async verify(_job: Job, turns: JobTurn[]): Promise<Verdict> {
        // never done in phase A (throws before getting here on 2nd turn)
        return turns.length >= 3 ? { kind: "done" } : { kind: "continue" }
      },
    }

    // The first runJob should throw when the provider blows up on call 1
    // (call 0 succeeds → 1 turn saved; call 1 throws → error propagates)
    try {
      await runJob(job, depsA)
    } catch {
      // expected
    }

    // Confirm exactly 1 turn was saved before the throw
    const turnsAfterA = store.loadTurns("j4")
    expect(turnsAfterA.length).toBe(1)

    // Phase B: close store, open a new one against the same temp dir, resume
    store.close()
    const store2 = new JobStore()

    const freshProvider = makeFakeProvider({ text: "Continuing..." })

    const depsB: JobRunnerDeps = {
      provider: freshProvider,
      registry: new ToolRegistry(),
      store: store2,
      governor: passGovernor,
      async verify(_job: Job, turns: JobTurn[]): Promise<Verdict> {
        return turns.length >= 3 ? { kind: "done" } : { kind: "continue" }
      },
    }

    const job2 = store2.get("j4")!
    const result = await runJob(job2, depsB)

    // Reassign store so afterEach cleans up store2
    store = store2

    expect(result.status).toBe("done")
    const finalTurns = store2.loadTurns("j4")
    // Should have 3 total (1 from phase A + 2 from phase B)
    expect(finalTurns.length).toBe(3)
  })

  test("6. a gated (unapproved) irreversible action pauses the job needs-human and invokes deps.ask", async () => {
    // A non-readOnly job → tradingPolicy() → an `irreversible` effect GATES to ctx.ask.
    store.create({ id: "j6", cwd: tmp, goal: "Place an order", maxTurns: 10, readOnly: false })
    const job = store.get("j6")!
    expect(job.readOnly).toBe(false) // drives tradingPolicy() (not readOnlyPolicy)

    // An irreversible tool the model will try to call.
    const gatedTool: Tool = buildTool({
      name: "danger",
      description: "an irreversible action",
      inputSchema: z.object({ x: z.number() }),
      effectClass: "irreversible",
      async call() {
        // Must NOT run — the gate denies before call().
        throw new Error("danger.call() should never execute when the gate denies")
      },
    })
    const registry = new ToolRegistry()
    registry.register(gatedTool)

    // Call 0: emit a tool_use for the gated tool. Call 1+: plain text (turn ends).
    let calls = 0
    const provider: Provider = {
      id: "gated-fake",
      async chat(_req: ChatRequest, _h?: StreamHandlers): Promise<ChatResult> {
        const idx = calls++
        if (idx === 0) {
          const blocks: ContentBlock[] = [{ type: "tool_use", id: "tu1", name: "danger", input: { x: 1 } }]
          return { text: "", blocks, inputTokens: 5, outputTokens: 3, stopReason: "tool_use" }
        }
        return { text: "ok", inputTokens: 5, outputTokens: 3, stopReason: "end_turn" }
      },
    }

    let askCalls = 0
    const ask = async (_tool: Tool, _input: unknown): Promise<PermissionDecision> => {
      askCalls++
      return "deny"
    }

    const deps: JobRunnerDeps = {
      provider,
      registry,
      store,
      governor: passGovernor,
      ask,
      async verify(): Promise<Verdict> {
        // The verifier should not even be reached — the gate pause returns first.
        return { kind: "done" }
      },
    }

    const result = await runJob(job, deps)

    expect(result.status).toBe("paused")
    expect(result.pauseReason).toBe("needs-human")
    expect(askCalls).toBeGreaterThanOrEqual(1) // the gate consulted ask
  })
})
