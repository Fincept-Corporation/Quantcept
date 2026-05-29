import { QuantceptError } from "@shared/errors"
import fs from "fs/promises"
import path from "path"
import { type LoadedSkill, SkillFrontmatterSchema } from "./manifest"

function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const content = raw.replace(/\r\n/g, "\n")
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content)
  if (!match) return { data: {}, body: content }
  const data: Record<string, unknown> = {}
  const lines = match[1]!.split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    i++
    if (/^\s/.test(line) || line.trim() === "") continue // skip stray indented/blank lines
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (value === "") {
      // Folded scalar: collect following indented (or blank) lines until the next top-level key.
      const parts: string[] = []
      while (i < lines.length && (/^\s/.test(lines[i]!) || lines[i]!.trim() === "")) {
        const cont = lines[i]!.trim()
        if (cont !== "") parts.push(cont)
        i++
      }
      value = parts.join(" ")
    }
    data[key] = value
  }
  return { data, body: match[2] ?? "" }
}

export async function loadSkillFromDir(dir: string): Promise<LoadedSkill> {
  const file = path.join(dir, "SKILL.md")
  const raw = await fs.readFile(file, "utf8")
  const { data, body } = parseFrontmatter(raw)
  const parsed = SkillFrontmatterSchema.safeParse(data)
  if (!parsed.success) throw new QuantceptError(`Invalid skill manifest in ${file}: ${parsed.error.message}`, "SKILL")
  return { ...parsed.data, prompt: body.trim(), dir }
}
