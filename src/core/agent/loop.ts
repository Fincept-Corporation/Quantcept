import type { HookRunner } from "@core/hooks/types"
import type { ChatMessage, ContentBlock, Provider, StreamHandlers, ToolDefinition } from "@core/llm/types"
import { messagesContainImage } from "@core/llm/vision"
import type { PermissionRule } from "@core/permissions/rules"
import type { PermissionDecision, PermissionMode } from "@core/permissions/schema"
import type { RiskVerdict } from "@core/risk/limits"
import { executeTool } from "@core/tools/executor"
import type { EffectPolicy } from "@core/tools/policy"
import type { ToolRegistry } from "@core/tools/registry"
import type { Tool } from "@core/tools/Tool"
import { z } from "zod/v4"
import type { AgentEventHandler } from "./events"

const MAX_ITERATIONS = 10

export interface AgentTurnInput {
  provider: Provider
  /** Optional vision-capable provider; image-bearing turns route here (computer-use). */
  visionProvider?: Provider
  /** Override the per-turn tool-iteration cap (default 10); GUI tasks need more. */
  maxIterations?: number
  registry: ToolRegistry
  messages: ChatMessage[]
  system?: string
  mode: PermissionMode
  cwd: string
  ask: (tool: Tool, input: unknown) => Promise<PermissionDecision>
  rules?: PermissionRule[]
  /** Plugin hooks fired around tool execution (PreToolUse/PostToolUse). */
  hooks?: HookRunner
  /** Graded reference monitor (allow|deny|gate per effect class) forwarded to the executor. */
  effectPolicy?: EffectPolicy
  onEvent?: AgentEventHandler
  snapshot?: {
    track(label: string): Promise<string | null>
    revertTo(treeHash: string): Promise<void>
  }
  /** Budget gate forwarded to the executor for per-tool-call enforcement. */
  budget?: {
    check(): { ok: boolean }
    recordToolCall(isData: boolean): void
  }
  /** Hard pre-trade risk gate forwarded to the executor (non-approvable deny for non-read effects). */
  riskGate?: (tool: Tool, input: unknown) => RiskVerdict
}

export interface AgentTurnResult {
  text: string
  messages: ChatMessage[]
  totalTokens: number
  inputTokens: number
  outputTokens: number
  /** Count of tool calls blocked pending human approval (effect gates) during this turn. */
  gatedActions: number
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
  let inputTokens = 0
  let outputTokens = 0
  let gatedActions = 0
  input.onEvent?.({ type: "turn_start" })

  const maxIterations = input.maxIterations ?? MAX_ITERATIONS
  for (let i = 0; i < maxIterations; i++) {
    // Route image-bearing turns to the vision provider when the primary model can't see.
    const provider = input.visionProvider && messagesContainImage(messages) ? input.visionProvider : input.provider
    const res = await provider.chat({ messages, system: input.system, tools }, handlers)
    totalTokens += res.inputTokens + res.outputTokens
    inputTokens += res.inputTokens
    outputTokens += res.outputTokens

    const toolUses = (res.blocks ?? []).filter(
      (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    )

    if (res.stopReason !== "tool_use" || toolUses.length === 0) {
      if (!handlers?.onChunk) input.onEvent?.({ type: "text", text: res.text })
      input.onEvent?.({ type: "turn_end", text: res.text })
      messages.push({ role: "assistant", content: res.text })
      return { text: res.text, messages, totalTokens, inputTokens, outputTokens, gatedActions }
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
        rules: input.rules,
        hooks: input.hooks,
        snapshot: input.snapshot,
        effectPolicy: input.effectPolicy,
        budget: input.budget,
        riskGate: input.riskGate,
      })
      if (r.needsHuman) gatedActions++
      input.onEvent?.({
        type: "tool_end",
        tool: tool.name,
        output: r.output,
        isError: !!r.isError,
        ...(r.title ? { title: r.title } : {}),
      })
      resultBlocks.push({
        type: "tool_result",
        toolUseId: use.id,
        output: r.output,
        isError: !!r.isError,
        image: r.image,
      })
    }
    messages.push({ role: "user", content: resultBlocks })
  }

  const fallback = "Reached the maximum number of tool iterations for this turn. Ask me to continue if needed."
  input.onEvent?.({ type: "turn_end", text: fallback })
  return { text: fallback, messages, totalTokens, inputTokens, outputTokens, gatedActions }
}
