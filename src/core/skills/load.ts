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
    // Inline array: `allowedTools: [a, b, c]` → string[].
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0)
      continue
    }
    if (value === "") {
      // Either a YAML block list (following `- item` lines) or a folded scalar.
      const listItems: string[] = []
      const scalarParts: string[] = []
      while (i < lines.length && (/^\s/.test(lines[i]!) || lines[i]!.trim() === "")) {
        const cont = lines[i]!.trim()
        if (cont !== "") {
          if (cont.startsWith("- "))
            listItems.push(
              cont
                .slice(2)
                .trim()
                .replace(/^["']|["']$/g, ""),
            )
          else scalarParts.push(cont)
        }
        i++
      }
      if (listItems.length > 0) {
        data[key] = listItems
        continue
      }
      value = scalarParts.join(" ")
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
