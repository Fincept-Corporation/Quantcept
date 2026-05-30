import type { z } from "zod/v4"
import type { EffectClass } from "./effects"

export interface ToolContext {
  abort: AbortSignal
  cwd: string
}

export interface ToolResult<Output = unknown> {
  output: Output
  title?: string
  isError?: boolean
  /** Set when a tool was blocked pending human approval — the runner pauses the job needs-human. */
  needsHuman?: boolean
  /**
   * Optional base64-encoded image (e.g. a screenshot) returned alongside the textual
   * output. The agent loop forwards it onto the tool_result content block so vision-capable
   * providers can see it. Shape is kept inline (not imported from llm) to preserve the
   * shared←core layering — tools must not depend on the LLM wire types.
   */
  image?: { mediaType: string; data: string }
}

export interface Tool<Input extends z.ZodType = z.ZodType, Output = unknown> {
  name: string
  description: string
  inputSchema: Input
  inputJSONSchema?: Record<string, unknown>
  permissionPatterns?(input: z.infer<Input>): string[]
  isReadOnly(input: z.infer<Input>): boolean
  isDestructive(input: z.infer<Input>): boolean
  /** Optional static declaration of the tool's real-world effect reversibility. */
  effectClass?: EffectClass
  call(input: z.infer<Input>, ctx: ToolContext): Promise<ToolResult<Output>>
}

type ToolDef<I extends z.ZodType, O> = Pick<Tool<I, O>, "name" | "description" | "inputSchema" | "call"> &
  Partial<Pick<Tool<I, O>, "isReadOnly" | "isDestructive" | "permissionPatterns" | "effectClass">>

export function buildTool<I extends z.ZodType, O>(def: ToolDef<I, O>): Tool<I, O> {
  return {
    isReadOnly: () => false,
    isDestructive: () => false,
    ...def,
  }
}
