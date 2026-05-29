import { z } from "zod/v4"
import { resolveInCwd } from "../paths"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  path: z.string(),
  content: z.string(),
})

export const WriteTool = buildTool({
  name: "write",
  description: "Write (create or overwrite) a UTF-8 file with the given content.",
  inputSchema: InputSchema,
  isDestructive: () => true,
  async call(input, ctx) {
    try {
      const abs = resolveInCwd(ctx.cwd, input.path)
      const bytes = await Bun.write(abs, input.content)
      return { output: `wrote ${bytes} bytes to ${input.path}`, title: `write ${input.path}` }
    } catch (e) {
      return { output: `write failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})
