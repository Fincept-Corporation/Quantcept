import type { HookRunner } from "@core/hooks/types"
import { checkPermission } from "@core/permissions/check"
import type { PermissionRule } from "@core/permissions/rules"
import { evaluate } from "@core/permissions/rules"
import type { PermissionDecision, PermissionMode } from "@core/permissions/schema"
import type { RiskVerdict } from "@core/risk/limits"
import { effectClassOf } from "./effects"
import { type EffectPolicy, evaluatePolicy } from "./policy"
import type { Tool, ToolResult } from "./Tool"

export interface ExecutorContext {
  mode: PermissionMode
  cwd: string
  abort: AbortSignal
  ask: (tool: Tool, input: unknown) => Promise<PermissionDecision>
  rules?: PermissionRule[]
  /** Plugin hooks; fired PreToolUse (a block denies the call) and PostToolUse. */
  hooks?: HookRunner
  snapshot?: {
    track(label: string): Promise<string | null>
    revertTo(treeHash: string): Promise<void>
  }
  /** Graded reference monitor: maps each effect class to allow|deny|gate. */
  effectPolicy?: EffectPolicy
  /** Budget gate; blocks the tool call and records tool-call spend when supplied. */
  budget?: {
    check(): { ok: boolean }
    recordToolCall(isData: boolean): void
  }
  /**
   * Hard, non-approvable pre-trade risk gate. Built by higher layers closing over the
   * TRUSTED ledger + configured limits. Runs only for non-read effects; a non-ok verdict
   * is a HARD deny (plain isError, never needsHuman). Returns { ok: true } for tools it
   * does not govern (e.g. non-order tools).
   */
  riskGate?: (tool: Tool, input: unknown) => RiskVerdict
}

export async function executeTool(tool: Tool, rawInput: unknown, ctx: ExecutorContext): Promise<ToolResult> {
  let input: unknown
  if (tool.inputJSONSchema) {
    // MCP tools carry JSON Schema; the server validates. Pass args through.
    input = rawInput
  } else {
    const parsed = tool.inputSchema.safeParse(rawInput)
    if (!parsed.success) {
      return { output: `Tool ${tool.name} received invalid input: ${parsed.error.message}`, isError: true }
    }
    input = parsed.data
  }

  // Hard pre-trade risk limits (agent-immutable). Evaluated for any non-read effect as a
  // HARD deny — surfaced as a plain isError, NEVER needsHuman, so it cannot be approved away.
  if (effectClassOf(tool, input) !== "read" && ctx.riskGate) {
    const risk = ctx.riskGate(tool, input)
    if (!risk.ok) {
      return { output: `Tool ${tool.name} blocked by risk limit: ${risk.detail ?? risk.violation}`, isError: true }
    }
  }

  let gatedApproved = false
  if (ctx.effectPolicy) {
    const cls = effectClassOf(tool, input)
    const action = evaluatePolicy(cls, ctx.effectPolicy)
    if (action === "deny") {
      return { output: `Tool ${tool.name} blocked: policy forbids '${cls}' effects`, isError: true }
    }
    if (action === "gate") {
      const decision = await ctx.ask(tool, input)
      if (decision !== "allow") {
        return { output: `Tool ${tool.name} requires human approval (effect: ${cls})`, isError: true, needsHuman: true }
      }
      gatedApproved = true
    }
  }

  if (ctx.budget && !ctx.budget.check().ok) {
    return { output: `Tool ${tool.name} blocked: budget exhausted`, isError: true }
  }

  // An approved gate already cleared the human check above; skip the normal permission re-prompt.
  if (!gatedApproved) {
    const patterns = tool.permissionPatterns?.(input) ?? []
    const rules = ctx.rules ?? []
    let ruleDecision: PermissionDecision | undefined
    if (patterns.length > 0) {
      // All-or-ask: any deny → deny; any unmatched (undefined) or ask → ask; only all-allow → allow.
      let sawDeny = false
      let sawUnresolved = false
      for (const p of patterns) {
        const d = evaluate(tool.name, p, rules)
        if (d === "deny") {
          sawDeny = true
          break
        }
        if (d === undefined || d === "ask") sawUnresolved = true
      }
      ruleDecision = sawDeny ? "deny" : sawUnresolved ? "ask" : "allow"
    }
    const decision: PermissionDecision =
      ruleDecision ??
      checkPermission({ isReadOnly: tool.isReadOnly(input), isDestructive: tool.isDestructive(input) }, ctx.mode)
    let finalDecision: PermissionDecision = decision
    if (decision === "ask") finalDecision = await ctx.ask(tool, input)

    if (finalDecision !== "allow") {
      return { output: `Permission denied for tool ${tool.name}`, isError: true }
    }
  }

  // PreToolUse hooks run after the permission gate; a block stops the call.
  if (ctx.hooks) {
    const pre = await ctx.hooks.fire({ event: "PreToolUse", cwd: ctx.cwd, toolName: tool.name, toolInput: input })
    if (pre.blocked) {
      return { output: `Tool ${tool.name} blocked by hook${pre.reason ? `: ${pre.reason}` : ""}`, isError: true }
    }
  }

  // Snapshot the worktree before a mutating tool so a failure can be reverted.
  let preSnapshot: string | null = null
  if (ctx.snapshot && !tool.isReadOnly(input)) {
    preSnapshot = await ctx.snapshot.track(tool.name)
  }

  try {
    const result = await tool.call(input, { abort: ctx.abort, cwd: ctx.cwd })
    if (ctx.hooks) {
      await ctx.hooks.fire({
        event: "PostToolUse",
        cwd: ctx.cwd,
        toolName: tool.name,
        toolInput: input,
        toolOutput: result.output,
      })
    }
    ctx.budget?.recordToolCall(effectClassOf(tool, input) === "read")
    return result
  } catch (e) {
    if (ctx.snapshot && preSnapshot) await ctx.snapshot.revertTo(preSnapshot)
    return { output: `Tool ${tool.name} failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
  }
}
