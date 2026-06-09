import { mkdir } from "node:fs/promises"
import path from "node:path"
import { slugifyAgentName } from "@core/agent/agents"
import { projectConfigDir, userConfigDir } from "@core/config/paths"
import { z } from "zod/v4"
import { buildTool } from "../Tool"

const InputSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  model: z.string().optional(),
  mode: z.enum(["append", "replace"]).optional(),
  scope: z.enum(["user", "project"]).optional(),
  overwrite: z.boolean().optional(),
})

/** Collapse to a single trimmed line — frontmatter is line-based, so any newline in a
 *  scalar value would inject extra (or break) frontmatter keys. */
function oneLine(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export const CreateAgentTool = buildTool({
  name: "create_agent",
  description:
    "Persist a new custom agent persona to disk as a Markdown file so the user can select it from the agent picker. " +
    "Only use when the user is explicitly creating/saving an agent. `systemPrompt` becomes the agent's behavior; " +
    "`name` and `description` are shown in the picker. `scope` defaults to 'user' (available across every project).",
  inputSchema: InputSchema,
  isDestructive: () => true,
  async call(input, ctx) {
    const slug = slugifyAgentName(input.name)
    if (!slug) return { output: `invalid agent name "${input.name}" (empty after slugify)`, isError: true }
    const description = oneLine(input.description)
    if (!description) return { output: "agent description is empty", isError: true }
    // model is a single token; strip any newline so it can't inject frontmatter lines.
    const model = oneLine(input.model ?? "") || undefined
    const dir = input.scope === "project" ? projectConfigDir(ctx.cwd) : userConfigDir()
    const agentsDir = path.join(dir, "agents")
    const file = path.join(agentsDir, `${slug}.md`)
    if (!input.overwrite && (await Bun.file(file).exists())) {
      return { output: `agent "${slug}" already exists at ${file}; pass overwrite:true to replace it`, isError: true }
    }
    const fm = [`name: ${slug}`, `description: ${description}`]
    if (model) fm.push(`model: ${model}`)
    if (input.mode) fm.push(`mode: ${input.mode}`)
    const md = `---\n${fm.join("\n")}\n---\n\n${input.systemPrompt.trim()}\n`
    try {
      await mkdir(agentsDir, { recursive: true })
      await Bun.write(file, md)
      return { output: `Created agent "${slug}" at ${file}`, title: `create agent ${slug}` }
    } catch (e) {
      return { output: `create_agent failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
    }
  },
})
