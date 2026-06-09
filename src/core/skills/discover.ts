import { discoverWithPrecedence, loadManifestDir } from "@core/manifest/load"
import { loadSkillFromDir } from "./load"
import type { LoadedSkill } from "./manifest"

export interface DiscoverSkillsOptions {
  bundledDir: string
  userDir: string
  projectDir: string
}

/** Discover skills with precedence project > user > bundled, deduped by name. */
export async function discoverSkills(opts: DiscoverSkillsOptions): Promise<LoadedSkill[]> {
  const load = (dir: string) => loadManifestDir({ dir, kind: "dir", parse: loadSkillFromDir })
  const [bundled, user, project] = await Promise.all([load(opts.bundledDir), load(opts.userDir), load(opts.projectDir)])
  return discoverWithPrecedence([bundled, user, project], (s) => s.name)
}
