import type { ChatMessage, ContentBlock, Provider, StreamHandlers, ToolDefinition } from "@core/llm/types"
import type { PermissionDecision, PermissionMode } from "@core/permissions/schema"
import { executeTool } from "@core/tools/executor"
import type { ToolRegistry } from "@core/tools/registry"
import type { Tool } from "@core/tools/Tool"
import { z } from "zod/v4"
import type { AgentEventHandler } from "./events"

const MAX_ITERATIONS = 10

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
  totalTokens: number
}

function toolDefs(registry: ToolRegistry): ToolDefinition[] {
  return registry.list().map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputJSONSchema ?? (z.toJSONSchema(t.inputSchema) as Record<string, unknown>),
  }))
}

export async function runAgentTurn(input: AgentTurnInput, handlers?: StreamHandlers): Promise<AgentTurnResult> {
  const messages = [...input.messages]
  const tools = toolDefs(input.registry)
  let totalTokens = 0
  input.onEvent?.({ type: "turn_start" })

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await input.provider.chat({ messages, system: input.system, tools }, handlers)
    totalTokens += res.inputTokens + res.outputTokens

    const toolUses = (res.blocks ?? []).filter(
      (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    )

    if (res.stopReason !== "tool_use" || toolUses.length === 0) {
      if (!handlers?.onChunk) input.onEvent?.({ type: "text", text: res.text })
      input.onEvent?.({ type: "turn_end", text: res.text })
      messages.push({ role: "assistant", content: res.text })
      return { text: res.text, messages, totalTokens }
    }

    const assistantBlocks: ContentBlock[] = []
    if (res.text) assistantBlocks.push({ type: "text", text: res.text })
    assistantBlocks.push(...toolUses)
    messages.push({ role: "assistant", content: assistantBlocks })

    const resultBlocks: ContentBlock[] = []
    for (const use of toolUses) {
      const tool = input.registry.get(use.name)
      if (!tool) {
        input.onEvent?.({ type: "tool_end", tool: use.name, output: `Tool not found: ${use.name}`, isError: true })
        resultBlocks.push({
          type: "tool_result",
          toolUseId: use.id,
          output: `Tool not found: ${use.name}`,
          isError: true,
        })
        continue
      }
      input.onEvent?.({ type: "tool_start", tool: tool.name, input: use.input })
      const r = await executeTool(tool, use.input, {
        mode: input.mode,
        cwd: input.cwd,
        abort: new AbortController().signal,
        ask: input.ask,
      })
      input.onEvent?.({ type: "tool_end", tool: tool.name, output: r.output, isError: !!r.isError })
      resultBlocks.push({ type: "tool_result", toolUseId: use.id, output: r.output, isError: !!r.isError })
    }
    messages.push({ role: "user", content: resultBlocks })
  }

  const fallback = "Reached the maximum number of tool iterations for this turn. Ask me to continue if needed."
  input.onEvent?.({ type: "turn_end", text: fallback })
  return { text: fallback, messages, totalTokens }
}
