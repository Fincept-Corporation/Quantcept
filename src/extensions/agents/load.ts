import { QuantceptError } from "@shared/errors"
import fs from "fs/promises"
import { AgentFrontmatterSchema, type LoadedAgent } from "./manifest"

function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content)
  if (!match) return { data: {}, body: content }
  const data: Record<string, unknown> = {}
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":")
    if (idx === -1) continue
    data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return { data, body: match[2] }
}

export async function loadAgentFromFile(file: string): Promise<LoadedAgent> {
  const raw = await fs.readFile(file, "utf8")
  const { data, body } = parseFrontmatter(raw)
  const parsed = AgentFrontmatterSchema.safeParse(data)
  if (!parsed.success) throw new QuantceptError(`Invalid agent manifest in ${file}: ${parsed.error.message}`, "AGENT")
  return { ...parsed.data, systemPrompt: body.trim() }
}
