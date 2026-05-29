import { z } from "zod/v4"
import { resolveInCwd } from "../paths"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  path: z.string(),
  oldString: z.string(),
  newString: z.string(),
  replaceAll: z.boolean().optional(),
})

function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") return 0
  let n = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    n++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return n
}

export const EditTool = buildTool({
  name: "edit",
  description: "Replace oldString with newString in a file. oldString must match exactly once unless replaceAll.",
  inputSchema: InputSchema,
  isDestructive: () => true,
  async call(input, ctx) {
    try {
      const abs = resolveInCwd(ctx.cwd, input.path)
      const text = await Bun.file(abs).text()
      const count = countOccurrences(text, input.oldString)
      if (count === 0) return { output: `oldString not found in ${input.path}`, isError: true }
      if (count > 1 && !input.replaceAll) {
        return {
          output: `oldString is not unique in ${input.path} (${count} matches); pass replaceAll or add more context`,
          isError: true,
        }
      }
      const next = input.replaceAll
        ? text.split(input.oldString).join(input.newString)
        : text.replace(input.oldString, input.newString)
      await Bun.write(abs, next)
      const k = input.replaceAll ? count : 1
      return { output: `edited ${input.path} (${k} replacement(s))`, title: `edit ${input.path}` }
    } catch (e) {
      return { output: `edit failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})
