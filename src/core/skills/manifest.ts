import { z } from "zod/v4"

export const SkillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  allowedTools: z.array(z.string()).optional(),
})

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>

export interface LoadedSkill extends SkillFrontmatter {
  prompt: string
  dir: string
}
