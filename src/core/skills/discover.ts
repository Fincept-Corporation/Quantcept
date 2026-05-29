import fs from "node:fs/promises"
import path from "node:path"
import { logger } from "@shared/logger"
import { loadSkillFromDir } from "./load"
import type { LoadedSkill } from "./manifest"

async function loadDir(dir: string): Promise<LoadedSkill[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: LoadedSkill[] = []
  for (const entry of entries) {
    const skillDir = path.join(dir, entry)
    try {
      const stat = await fs.stat(skillDir)
      if (!stat.isDirectory()) continue
      out.push(await loadSkillFromDir(skillDir))
    } catch (error) {
      logger.warn(`Skipping skill dir ${entry}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return out
}

export interface DiscoverSkillsOptions {
  bundledDir: string
  userDir: string
  projectDir: string
}

/** Discover skills with precedence project > user > bundled, deduped by name. */
export async function discoverSkills(opts: DiscoverSkillsOptions): Promise<LoadedSkill[]> {
  const bundled = await loadDir(opts.bundledDir)
  const user = await loadDir(opts.userDir)
  const project = await loadDir(opts.projectDir)
  const byName = new Map<string, LoadedSkill>()
  for (const s of bundled) byName.set(s.name, s)
  for (const s of user) byName.set(s.name, s)
  for (const s of project) byName.set(s.name, s)
  return [...byName.values()]
}
