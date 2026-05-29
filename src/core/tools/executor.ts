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
  for (const p of patterns) {
    const d = evaluate(tool.name, p, rules)
    if (d === "deny") {
      ruleDecision = "deny"
      break
    }
    if (d === "ask") ruleDecision = ruleDecision === undefined || ruleDecision === "allow" ? "ask" : ruleDecision
    else if (d === "allow" && ruleDecision === undefined) ruleDecision = "allow"
  }
  const decision: PermissionDecision =
    ruleDecision ??
    checkPermission({ isReadOnly: tool.isReadOnly(input), isDestructive: tool.isDestructive(input) }, ctx.mode)
  let finalDecision: PermissionDecision = decision
  if (decision === "ask") finalDecision = await ctx.ask(tool, input)

  if (finalDecision !== "allow") {
    return { output: `Permission denied for tool ${tool.name}`, isError: true }
  }

  try {
    return await tool.call(input, { abort: ctx.abort, cwd: ctx.cwd })
  } catch (e) {
    return { output: `Tool ${tool.name} failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
  }
}
