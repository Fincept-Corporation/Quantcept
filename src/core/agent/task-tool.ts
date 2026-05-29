import type { Provider } from "@core/llm/types"
import type { PermissionRule } from "@core/permissions/rules"
import type { PermissionMode } from "@core/permissions/schema"
import { ToolRegistry } from "@core/tools/registry"
import { buildTool, type Tool } from "@core/tools/Tool"
import { z } from "zod/v4"
import type { LoadedAgent } from "./agent-manifest"
import { runAgentTurn } from "./loop"

export interface TaskToolContext {
  provider: Provider
  baseRegistry: ToolRegistry
  rules: PermissionRule[]
  mode: PermissionMode
  agents: Map<string, LoadedAgent>
  maxDepth: number
}

const DEFAULT_SUBAGENT_PROMPT =
  "You are a focused sub-agent. Complete the requested task using the available tools and respond with a concise result."

const InputSchema = z.object({
  prompt: z.string(),
  agent: z.string().optional(),
  tools: z.array(z.string()).optional(),
})

export function createTaskTool(ctx: TaskToolContext): Tool {
  return buildTool({
    name: "task",
    description:
      "Delegate a focused sub-task to an isolated sub-agent. Optionally adopt a named agent persona and restrict its tools.",
    inputSchema: InputSchema,
    async call(input, toolCtx) {
      let system = DEFAULT_SUBAGENT_PROMPT
      if (input.agent) {
        const agent = ctx.agents.get(input.agent)
        if (!agent) return { output: `Unknown agent: ${input.agent}`, isError: true }
        system = agent.systemPrompt
      }

      const sub = new ToolRegistry()
      for (const t of ctx.baseRegistry.list()) {
        if (t.name === "task") continue
        if (input.tools && !input.tools.includes(t.name)) continue
        sub.register(t)
      }
      if (ctx.maxDepth > 0) {
        sub.register(createTaskTool({ ...ctx, maxDepth: ctx.maxDepth - 1 }))
      }

      const result = await runAgentTurn({
        provider: ctx.provider,
        registry: sub,
        messages: [{ role: "user", content: input.prompt }],
        system,
        mode: ctx.mode,
        rules: ctx.rules,
        cwd: toolCtx.cwd,
        ask: async () => "deny",
      })
      return { output: result.text, title: `task: ${input.agent ?? "subagent"}` }
    },
  })
}
