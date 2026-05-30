import { McpServerSchema } from "@core/mcp/config"
import type { AddResult } from "@core/mcp/manager"
import { writeServerToSettings } from "@core/mcp/persist"
import { buildTool } from "@core/tools/Tool"
import { logger } from "@shared/logger"
import { z } from "zod/v4"

// Minimal manager surface this tool needs (the real McpManager satisfies it).
export interface AddMcpServerManager {
  addServer(name: string, config: unknown): Promise<AddResult>
}

export interface AddMcpServerDeps {
  manager: AddMcpServerManager
  cwd: string
  // Injectable for tests; defaults to the real settings.json writer.
  persist?: (name: string, config: unknown, cwd?: string) => void
}

// The model-facing input: `name` (the registry/map key) plus the server spec fields. The
// spec is validated against McpServerSchema (the Phase-2 union); `name` is validated here.
const InputSchema = z.object({
  name: z.string(),
  type: z.enum(["stdio", "http"]).optional(),
  // stdio
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  // http
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  transport: z.enum(["auto", "http", "sse"]).optional(),
  auth: z.object({ type: z.literal("oauth"), scopes: z.array(z.string()).optional() }).optional(),
  // common
  enabled: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
})

const DESCRIPTION = [
  "Add (install) a new MCP server at runtime and register its tools immediately.",
  "Provide `name` plus either a stdio spec (`command` + optional `args`/`env`) or an http spec",
  "(`type:\"http\"` + `url`, optional `headers`). Prefer `npx -y <package>` stdio servers or an",
  "https url. Put secrets in headers as ${ENV_VAR} placeholders, never inline. You will be asked",
  "to confirm the exact command/url before it connects. OAuth servers are added but require the",
  "user to run /mcp auth afterwards.",
].join(" ")

function normalizeName(s: string): string {
  return s.trim().replace(/[^a-zA-Z0-9_-]/g, "_")
}

export function createAddMcpServerTool(deps: AddMcpServerDeps) {
  const persist = deps.persist ?? writeServerToSettings
  return buildTool({
    name: "add_mcp_server",
    description: DESCRIPTION,
    inputSchema: InputSchema,
    isReadOnly: () => false,
    isDestructive: () => true,
    // A returned pattern forces the executor to ASK regardless of permission mode (the
    // executor consults `mode` only when no pattern is emitted). This is the always-ask gate.
    permissionPatterns: (input) => [`mcp_add:${normalizeName(input.name)}`],
    async call(input) {
      const name = normalizeName(input.name)
      if (!name) return { output: "add_mcp_server: a non-empty server name is required", isError: true }

      // Validate the spec (everything except `name`) against the real union schema.
      const { name: _drop, ...spec } = input
      const parsed = McpServerSchema.safeParse(spec)
      if (!parsed.success) {
        return { output: `add_mcp_server: invalid server spec: ${parsed.error.message}`, isError: true }
      }

      const res = await deps.manager.addServer(name, parsed.data)
      if (!res.ok) return { output: res.message, isError: true }

      // Persist on success; a write failure is non-fatal (the server is live this session).
      try {
        persist(name, parsed.data, deps.cwd)
      } catch (e) {
        logger.warn("failed to persist MCP server to settings.json", { server: name, error: String(e) })
        return { output: `${res.message} (warning: could not be saved to settings.json; not persisted)` }
      }
      return { output: res.message, title: `mcp: added ${name}` }
    },
  })
}
