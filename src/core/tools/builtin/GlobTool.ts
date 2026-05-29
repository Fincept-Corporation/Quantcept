import { z } from "zod/v4"
import { resolveInCwd } from "../paths"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  pattern: z.string(),
  cwd: z.string().optional(),
})

export const GlobTool = buildTool<typeof InputSchema, string[] | string>({
  name: "glob",
  description: "Find files matching a glob pattern (e.g. **/*.ts), relative to the workspace.",
  inputSchema: InputSchema,
  isReadOnly: () => true,
  async call(input, ctx) {
    try {
      const base = resolveInCwd(ctx.cwd, input.cwd ?? ".")
      const glob = new Bun.Glob(input.pattern)
      const out: string[] = []
      for await (const f of glob.scan({ cwd: base, onlyFiles: true })) {
        out.push(f.replaceAll("\\", "/"))
      }
      out.sort()
      return { output: out, title: `${out.length} match(es)` }
    } catch (e) {
      return { output: `glob failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})
