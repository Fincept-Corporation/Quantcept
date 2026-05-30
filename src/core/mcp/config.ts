import { z } from "zod/v4"

export const McpAuthSchema = z.object({
  type: z.literal("oauth"),
  scopes: z.array(z.string()).optional(),
})

export const McpStdioServerSchema = z.object({
  type: z.literal("stdio").default("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
  timeout: z.number().int().positive().default(30000),
})

export const McpHttpServerSchema = z.object({
  type: z.literal("http"),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  transport: z.enum(["auto", "http", "sse"]).default("auto"),
  auth: McpAuthSchema.optional(),
  enabled: z.boolean().default(true),
  timeout: z.number().int().positive().default(30000),
})

// Legacy Phase-1 entries are bare `{ command, args, ... }` with no `type`. Inject
// type:"stdio" when it is absent so those configs keep parsing, then discriminate on
// `type` for clean per-variant errors.
export const McpServerSchema = z.preprocess(
  (v) => (v && typeof v === "object" && !Array.isArray(v) && !("type" in v) ? { ...v, type: "stdio" } : v),
  z.discriminatedUnion("type", [McpStdioServerSchema, McpHttpServerSchema]),
)

export const McpConfigSchema = z
  .object({ servers: z.record(z.string(), McpServerSchema).default({}) })
  .default({ servers: {} })

export type McpAuth = z.infer<typeof McpAuthSchema>
export type McpStdioServer = z.infer<typeof McpStdioServerSchema>
export type McpHttpServer = z.infer<typeof McpHttpServerSchema>
export type McpServer = z.infer<typeof McpServerSchema>
export type McpConfig = z.infer<typeof McpConfigSchema>
