import { z } from "zod/v4"
import { resolveInCwd } from "../paths"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  pattern: z.string(),
  glob: z.string().optional(),
  caseInsensitive: z.boolean().optional(),
})

const MAX_MATCHES = 500

export const GrepTool = buildTool({
  name: "grep",
  description: "Search file contents by regex. Returns file:line:text lines. Filter files with `glob`.",
  inputSchema: InputSchema,
  isReadOnly: () => true,
  async call(input, ctx) {
    let re: RegExp
    try {
      re = new RegExp(input.pattern, input.caseInsensitive ? "i" : "")
    } catch (e) {
      return { output: `invalid regex: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
    try {
      const base = resolveInCwd(ctx.cwd, ".")
      const glob = new Bun.Glob(input.glob ?? "**/*")
      const matches: string[] = []
      outer: for await (const f of glob.scan({ cwd: base, onlyFiles: true })) {
        let text: string
        try {
          text = await Bun.file(`${base}/${f}`).text()
        } catch {
          continue
        }
        const lines = text.split("\n")
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            matches.push(`${f.replaceAll("\\", "/")}:${i + 1}:${lines[i]}`)
            if (matches.length >= MAX_MATCHES) break outer
          }
        }
      }
      if (matches.length === 0) return { output: "no matches", title: "0 matches" }
      const truncated = matches.length >= MAX_MATCHES ? "\n…(truncated at 500)" : ""
      return { output: matches.join("\n") + truncated, title: `${matches.length} match(es)` }
    } catch (e) {
      return { output: `grep failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})
