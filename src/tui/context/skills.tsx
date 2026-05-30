// src/tui/context/skills.tsx

import { join } from "node:path"
import { projectConfigDir, userConfigDir } from "@core/config/paths"
import { discoverSkills, type LoadedSkill, SkillRegistry, skillsSystemBlock } from "@core/skills"
import { logger } from "@shared/logger"
import { createResource } from "solid-js"
import { createSimpleContext } from "./helper"
import { usePlugins } from "./plugins"

// Bundled skills ship under src/extensions/skills/bundled. Resolve relative to
// this module so it works in dev; if missing (e.g. compiled binary), discovery
// simply yields no bundled skills.
const BUNDLED_DIR = join(import.meta.dir, "..", "..", "extensions", "skills", "bundled")

export const { use: useSkills, provider: SkillsProvider } = createSimpleContext({
  name: "Skills",
  init: () => {
    const plugins = usePlugins()
    const [registry] = createResource(async () => {
      try {
        const skills = await discoverSkills({
          bundledDir: BUNDLED_DIR,
          userDir: join(userConfigDir(), "skills"),
          projectDir: join(projectConfigDir(), "skills"),
        })
        return new SkillRegistry(skills)
      } catch (error) {
        logger.warn("skill discovery failed", { error: String(error) })
        return new SkillRegistry([])
      }
    })

    // Plugin skills (namespaced plugin:skill) join discovered ones; project/user discovery wins on name.
    const merged = (): LoadedSkill[] => {
      const byName = new Map<string, LoadedSkill>()
      for (const s of plugins.skills()) byName.set(s.name, s)
      for (const s of registry()?.all() ?? []) byName.set(s.name, s)
      return [...byName.values()]
    }

    return {
      all(): LoadedSkill[] {
        return merged()
      },
      get(name: string): LoadedSkill | undefined {
        return merged().find((s) => s.name === name)
      },
      systemBlock(): string {
        return skillsSystemBlock(merged())
      },
      ready: true,
    }
  },
})
