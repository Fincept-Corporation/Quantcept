import type { Tool } from "@core/tools/Tool"
import { z } from "zod/v4"
import type { McpClient } from "./client"
import type { McpToolDef } from "./types"

function normalize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_")
}

export function bridgeMcpTool(server: string, def: McpToolDef, client: McpClient): Tool {
  return {
    name: `mcp__${normalize(server)}__${normalize(def.name)}`,
    description: def.description ?? "",
    inputSchema: z.object({}).passthrough(),
    inputJSONSchema: def.inputSchema,
    isReadOnly: () => def.annotations?.readOnlyHint ?? false,
    isDestructive: () => def.annotations?.destructiveHint ?? false,
    async call(input) {
      const r = await client.callTool(def.name, input)
      return { output: r.output, isError: r.isError }
    },
  }
}
