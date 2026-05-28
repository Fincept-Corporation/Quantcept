import type { ChatMessage, Provider } from "@core/llm/types"
import type { PermissionDecision, PermissionMode } from "@core/permissions/schema"
import { executeTool } from "@core/tools/executor"
import type { ToolRegistry } from "@core/tools/registry"
import type { Tool } from "@core/tools/Tool"
import type { AgentEventHandler } from "./events"

const MAX_ITERATIONS = 10
const TOOL_CALL_PREFIX = "TOOL_CALL:" // test/dev shim; real parsing added with engine adoption

export interface AgentTurnInput {
  provider: Provider
  registry: ToolRegistry
  messages: ChatMessage[]
  system?: string
  mode: PermissionMode
  cwd: string
  ask: (tool: Tool, input: unknown) => Promise<PermissionDecision>
  onEvent?: AgentEventHandler
}

export interface AgentTurnResult {
  text: string
  messages: ChatMessage[]
}

function parseToolCall(text: string): { name: string; input: unknown } | null {
  if (!text.startsWith(TOOL_CALL_PREFIX)) return null
  const rest = text.slice(TOOL_CALL_PREFIX.length)
  const firstColon = rest.indexOf(":")
  const name = rest.slice(0, firstColon)
  try {
    return { name, input: JSON.parse(rest.slice(firstColon + 1)) }
  } catch {
    return null
  }
}

export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const messages = [...input.messages]
  input.onEvent?.({ type: "turn_start" })

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await input.provider.chat({ messages, system: input.system })
    const call = parseToolCall(result.text)

    if (!call) {
      input.onEvent?.({ type: "text", text: result.text })
      input.onEvent?.({ type: "turn_end", text: result.text })
      messages.push({ role: "assistant", content: result.text })
      return { text: result.text, messages }
    }

    const tool = input.registry.get(call.name)
    if (!tool) {
      messages.push({ role: "assistant", content: result.text })
      messages.push({ role: "user", content: `Tool not found: ${call.name}` })
      continue
    }

    input.onEvent?.({ type: "tool_start", tool: tool.name, input: call.input })
    const toolResult = await executeTool(tool, call.input, {
      mode: input.mode,
      cwd: input.cwd,
      abort: new AbortController().signal,
      ask: input.ask,
    })
    input.onEvent?.({ type: "tool_end", tool: tool.name, output: toolResult.output, isError: !!toolResult.isError })

    messages.push({ role: "assistant", content: result.text })
    messages.push({ role: "user", content: `Tool ${tool.name} result: ${JSON.stringify(toolResult.output)}` })
  }

  const fallback = "Reached maximum tool iterations."
  input.onEvent?.({ type: "turn_end", text: fallback })
  return { text: fallback, messages }
}
