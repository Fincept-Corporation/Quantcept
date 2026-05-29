import type { z } from "zod/v4"

export interface ToolContext {
  abort: AbortSignal
  cwd: string
}

export interface ToolResult<Output = unknown> {
  output: Output
  title?: string
  isError?: boolean
}

export interface Tool<Input extends z.ZodType = z.ZodType, Output = unknown> {
  name: string
  description: string
  inputSchema: Input
  inputJSONSchema?: Record<string, unknown>
  isReadOnly(input: z.infer<Input>): boolean
  isDestructive(input: z.infer<Input>): boolean
  call(input: z.infer<Input>, ctx: ToolContext): Promise<ToolResult<Output>>
}

type ToolDef<I extends z.ZodType, O> = Pick<Tool<I, O>, "name" | "description" | "inputSchema" | "call"> &
  Partial<Pick<Tool<I, O>, "isReadOnly" | "isDestructive">>

export function buildTool<I extends z.ZodType, O>(def: ToolDef<I, O>): Tool<I, O> {
  return {
    isReadOnly: () => false,
    isDestructive: () => false,
    ...def,
  }
}
