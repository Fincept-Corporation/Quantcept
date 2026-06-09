import type { ToolRegistry } from "@core/tools/registry"
import { z } from "zod/v4"

/** One Anthropic tool schema, as the Fincept terminal-tools register endpoint expects. */
export interface ClientToolSchema {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

// Meta/local-orchestration tools that don't make sense to advertise to the cloud
// model for client execution (sub-agent recursion, runtime MCP install).
const EXCLUDED = new Set(["task", "add_mcp_server"])

/**
 * Serialize a local tool registry into the Anthropic tool schemas the Fincept
 * terminal-tools bridge advertises to the cloud model, so a cloud generation can
 * call the user's on-device tools (executed locally via the bridge). Mirrors the
 * agent loop's `inputJSONSchema ?? z.toJSONSchema(inputSchema)` conversion.
 */
export function serializeClientTools(registry: ToolRegistry): ClientToolSchema[] {
  const out: ClientToolSchema[] = []
  for (const t of registry.list()) {
    if (EXCLUDED.has(t.name)) continue
    const schema = t.inputJSONSchema ?? (z.toJSONSchema(t.inputSchema) as Record<string, unknown>)
    out.push({ name: t.name, description: t.description, input_schema: schema })
  }
  return out
}
