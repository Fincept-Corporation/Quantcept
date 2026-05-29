import { recall } from "@core/memory"
import { projectHash } from "@core/storage/paths"
import { z } from "zod/v4"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  scope: z.enum(["global", "project"]).default("project"),
  title: z.string().min(1),
})

export const RecallTool = buildTool({
  name: "recall",
  description:
    "Read the full content of a memory topic by its title (as listed in the memory index). scope 'project' or 'global'.",
  inputSchema: InputSchema,
  isReadOnly: () => true,
  async call(input, ctx) {
    const ph = input.scope === "project" ? projectHash(ctx.cwd) : undefined
    const body = recall({ scope: input.scope, projectHash: ph, title: input.title })
    if (body === null) return { output: `No memory found for "${input.title}" (${input.scope}).` }
    return { output: body, title: `recall ${input.title}` }
  },
})
