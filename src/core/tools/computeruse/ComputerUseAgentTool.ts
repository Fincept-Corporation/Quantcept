import { OpenAIComputerClient, runOpenAIComputerUse } from "@core/agent/openaiComputerUse"
import { buildTool } from "@core/tools/Tool"
import { z } from "zod/v4"
import type { SidecarClient } from "./sidecarClient"

export interface ComputerUseAgentDeps {
  sidecar: SidecarClient
  apiKey: string
  /** CUA-capable model (gpt-5.5 / gpt-5.4). Defaults to gpt-5.5. */
  model?: string
  baseUrl?: string
  onAudit?: (line: string) => void
  maxSteps?: number
}

export const ComputerUseAgentInputSchema = z.object({
  instruction: z.string().min(1),
})

/**
 * `computerUse` — delegate a whole GUI task to OpenAI's GA computer-use model (gpt-5.5), which
 * is trained for pixel grounding and drives the screen via our sidecar. One tool call runs the
 * entire task to completion (far more reliable than coordinate-guessing with a general model).
 */
export function createComputerUseAgentTool(deps: ComputerUseAgentDeps) {
  const responses = new OpenAIComputerClient(deps.apiKey, deps.model ?? "gpt-5.5", deps.baseUrl)
  return buildTool({
    name: "computerUse",
    description:
      "Delegate a GUI task to an autonomous computer-use agent that sees the screen and controls the mouse/keyboard. Give a clear, complete `instruction` (e.g. \"open Chrome, go to fincept.in, and scroll to the bottom\"). It runs the whole task to completion and returns a summary. Use this for anything needing clicking, typing, scrolling, or navigating apps/websites.",
    inputSchema: ComputerUseAgentInputSchema,
    isReadOnly: () => false,
    isDestructive: () => true,
    async call(input, ctx) {
      const result = await runOpenAIComputerUse(input.instruction, {
        responses,
        sidecar: deps.sidecar,
        onAudit: deps.onAudit,
        maxSteps: deps.maxSteps,
        abort: ctx.abort,
      })
      return { output: result, title: "computerUse" }
    },
  })
}
