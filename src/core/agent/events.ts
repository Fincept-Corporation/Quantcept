export type AgentEvent =
  | { type: "turn_start" }
  | { type: "text"; text: string }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_end"; tool: string; output: unknown; isError: boolean; title?: string }
  | { type: "turn_end"; text: string }

export type AgentEventHandler = (event: AgentEvent) => void
