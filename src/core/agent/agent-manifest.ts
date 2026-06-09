import { z } from "zod/v4"

export const AgentFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  model: z.string().optional(),
  mode: z.enum(["append", "replace"]).optional(),
})

export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>

export interface LoadedAgent extends AgentFrontmatter {
  systemPrompt: string
}
