import type { LoadedAgent } from "./agent-manifest"

export interface ComposeSystemInput {
  base: string
  memory?: string
  skills?: string
  plugins?: string
  agent?: LoadedAgent
}

/**
 * Assemble the session system prompt. By default an agent's persona is layered on
 * top of the base prompt + memory + skills + plugin context (so agents inherit all
 * base functionality). An agent with `mode: "replace"` fully overrides instead.
 */
export function composeSystemPrompt(input: ComposeSystemInput): string {
  const { base, memory, skills, plugins, agent } = input
  if (agent?.mode === "replace") return agent.systemPrompt
  const parts = [base, memory, skills, plugins]
  if (agent) parts.push(`# Active persona: ${agent.name}\n\n${agent.systemPrompt}`)
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join("\n\n")
}
