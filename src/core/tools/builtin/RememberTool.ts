import { remember } from "@core/memory"
import { projectHash } from "@core/storage/paths"
import { z } from "zod/v4"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  scope: z.enum(["global", "project"]).default("project"),
  title: z.string().min(1),
  fact: z.string().min(1),
})

export const RememberTool = buildTool({
  name: "remember",
  description:
    "Save a durable fact to persistent memory so it is recalled in future sessions. Use for stable user facts/preferences (e.g. portfolio, risk tolerance, answer style), not transient details. scope 'project' (this workspace) or 'global' (all projects).",
  inputSchema: InputSchema,
  isReadOnly: () => false,
  async call(input, ctx) {
    try {
      const ph = input.scope === "project" ? projectHash(ctx.cwd) : undefined
      const { slug } = remember({ scope: input.scope, projectHash: ph, title: input.title, fact: input.fact })
      return { output: `Remembered "${input.title}" (${input.scope}).`, title: `remember ${slug}` }
    } catch (e) {
      return { output: `remember failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})
