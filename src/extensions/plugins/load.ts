import { loadSkillFromDir } from "@core/skills/load"
import type { LoadedSkill } from "@core/skills/manifest"
import { QuantceptError } from "@shared/errors"
import fs from "fs/promises"
import path from "path"
import { type PluginManifest, PluginManifestSchema } from "./manifest"

export interface LoadedPlugin {
  manifest: PluginManifest
  dir: string
  skills: LoadedSkill[]
}

export async function loadPluginFromDir(dir: string): Promise<LoadedPlugin> {
  const manifestFile = path.join(dir, "plugin.json")
  const raw = JSON.parse(await fs.readFile(manifestFile, "utf8"))
  const parsed = PluginManifestSchema.safeParse(raw)
  if (!parsed.success)
    throw new QuantceptError(`Invalid plugin manifest in ${manifestFile}: ${parsed.error.message}`, "PLUGIN")

  const skills: LoadedSkill[] = []
  for (const skillsPath of parsed.data.skillsPaths) {
    const skillsDir = path.join(dir, skillsPath)
    let entries: string[] = []
    try {
      entries = await fs.readdir(skillsDir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const skillDir = path.join(skillsDir, entry)
      try {
        skills.push(await loadSkillFromDir(skillDir))
      } catch {
        // skip non-skill dirs
      }
    }
  }
  return { manifest: parsed.data, dir, skills }
}
