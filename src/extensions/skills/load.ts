import { QuantceptError } from "@shared/errors"
import fs from "fs/promises"
import path from "path"
import { type LoadedSkill, SkillFrontmatterSchema } from "./manifest"

function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content)
  if (!match) return { data: {}, body: content }
  const data: Record<string, unknown> = {}
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    data[key] = value
  }
  return { data, body: match[2] }
}

export async function loadSkillFromDir(dir: string): Promise<LoadedSkill> {
  const file = path.join(dir, "SKILL.md")
  const raw = await fs.readFile(file, "utf8")
  const { data, body } = parseFrontmatter(raw)
  const parsed = SkillFrontmatterSchema.safeParse(data)
  if (!parsed.success) throw new QuantceptError(`Invalid skill manifest in ${file}: ${parsed.error.message}`, "SKILL")
  return { ...parsed.data, prompt: body.trim(), dir }
}
