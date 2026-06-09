import { QuantceptError } from "@shared/errors"
import { parseFrontmatter } from "@shared/frontmatter"
import fs from "fs/promises"
import { AgentFrontmatterSchema, type LoadedAgent } from "./agent-manifest"

export async function loadAgentFromFile(file: string): Promise<LoadedAgent> {
  const raw = await fs.readFile(file, "utf8")
  const { data, body } = parseFrontmatter(raw)
  // A bare `model:` (empty value) must read as ABSENT so the configured model is inherited,
  // not overridden by "". The shared parser keeps empty scalars; drop them here.
  for (const k of Object.keys(data)) if (data[k] === "") delete data[k]
  const parsed = AgentFrontmatterSchema.safeParse(data)
  if (!parsed.success) throw new QuantceptError(`Invalid agent manifest in ${file}: ${parsed.error.message}`, "AGENT")
  return { ...parsed.data, systemPrompt: body.trim() }
}
