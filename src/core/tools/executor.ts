import { checkPermission } from "@core/permissions/check"
import type { PermissionDecision, PermissionMode } from "@core/permissions/schema"
import type { Tool, ToolResult } from "./Tool"

export interface ExecutorContext {
  mode: PermissionMode
  cwd: string
  abort: AbortSignal
  ask: (tool: Tool, input: unknown) => Promise<PermissionDecision>
}

export async function executeTool(tool: Tool, rawInput: unknown, ctx: ExecutorContext): Promise<ToolResult> {
  const parsed = tool.inputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { output: `Tool ${tool.name} received invalid input: ${parsed.error.message}`, isError: true }
  }
  const input = parsed.data

  const decision = checkPermission(
    { isReadOnly: tool.isReadOnly(input), isDestructive: tool.isDestructive(input) },
    ctx.mode,
  )
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
