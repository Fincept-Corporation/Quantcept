import { z } from "zod/v4"
import { resolveInCwd } from "../paths"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  path: z.string(),
  offset: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
})

export const ReadTool = buildTool({
  name: "read",
  description: "Read a file's contents (UTF-8), optionally a line range. offset is 1-based.",
  inputSchema: InputSchema,
  isReadOnly: () => true,
  async call(input, ctx) {
    try {
      const abs = resolveInCwd(ctx.cwd, input.path)
      const text = await Bun.file(abs).text()
      const lines = text.split("\n")
      const start = input.offset ? input.offset - 1 : 0
      const end = input.limit ? start + input.limit : lines.length
      const slice = lines.slice(start, end)
      const numbered = slice.map((l, i) => `${start + i + 1}\t${l}`).join("\n")
      return { output: numbered, title: `read ${input.path}` }
    } catch (e) {
      return { output: `read failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})
