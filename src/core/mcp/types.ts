export interface McpToolDef {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
  }
}
