import { QuantceptError } from "@shared/errors"
import { parseFrontmatter } from "@shared/frontmatter"
import fs from "fs/promises"
import path from "path"
import { type LoadedSkill, SkillFrontmatterSchema } from "./manifest"

export async function loadSkillFromDir(dir: string): Promise<LoadedSkill> {
  const file = path.join(dir, "SKILL.md")
  const raw = await fs.readFile(file, "utf8")
  const { data, body } = parseFrontmatter(raw)
  const parsed = SkillFrontmatterSchema.safeParse(data)
  if (!parsed.success) throw new QuantceptError(`Invalid skill manifest in ${file}: ${parsed.error.message}`, "SKILL")
  return { ...parsed.data, prompt: body.trim(), dir }
}
