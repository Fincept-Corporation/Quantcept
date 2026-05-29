import { z } from "zod/v4"

export const McpStdioServerSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
  timeout: z.number().int().positive().default(30000),
})

export const McpConfigSchema = z
  .object({ servers: z.record(z.string(), McpStdioServerSchema).default({}) })
  .default({ servers: {} })

export type McpStdioServer = z.infer<typeof McpStdioServerSchema>
export type McpConfig = z.infer<typeof McpConfigSchema>
