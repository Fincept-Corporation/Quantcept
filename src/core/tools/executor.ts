import { checkPermission } from "@core/permissions/check"
import type { PermissionRule } from "@core/permissions/rules"
import { evaluate } from "@core/permissions/rules"
import type { PermissionDecision, PermissionMode } from "@core/permissions/schema"
import type { Tool, ToolResult } from "./Tool"

export interface ExecutorContext {
  mode: PermissionMode
  cwd: string
  abort: AbortSignal
  ask: (tool: Tool, input: unknown) => Promise<PermissionDecision>
  rules?: PermissionRule[]
  snapshot?: {
    track(label: string): Promise<string | null>
    revertTo(treeHash: string): Promise<void>
  }
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

  // Snapshot the worktree before a mutating tool so a failure can be reverted.
  let preSnapshot: string | null = null
  if (ctx.snapshot && !tool.isReadOnly(input)) {
    preSnapshot = await ctx.snapshot.track(tool.name)
  }

  try {
    return await tool.call(input, { abort: ctx.abort, cwd: ctx.cwd })
  } catch (e) {
    if (ctx.snapshot && preSnapshot) await ctx.snapshot.revertTo(preSnapshot)
    return { output: `Tool ${tool.name} failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
  }
}
