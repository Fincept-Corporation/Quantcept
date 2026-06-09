import fs from "node:fs/promises"
import path from "node:path"
import { discoverWithPrecedence, loadManifestDir } from "@core/manifest/load"
import { loadAgentFromFile } from "./agent-load"
import type { LoadedAgent } from "./agent-manifest"

/**
 * Canonical kebab-case, filesystem-safe agent slug; "" when nothing usable remains.
 * Shared by create AND delete so the two can never drift, and so a name can never
 * contain a path separator or `..` (closes path-traversal on the delete path).
 */
export function slugifyAgentName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Load every .md agent definition in `dir` into a map keyed by agent name. Missing dir → empty map. */
export async function loadAgents(dir: string): Promise<Map<string, LoadedAgent>> {
  // loadManifestDir surfaces a malformed file via logger.warn and skips it, so one typo'd
  // frontmatter never drops the whole directory. Last definition of a name wins.
  const agents = await loadManifestDir({ dir, kind: "file", parse: loadAgentFromFile })
  const map = new Map<string, LoadedAgent>()
  for (const a of agents) map.set(a.name, a)
  return map
}

/**
 * Delete a custom agent's `.md` from the user and/or project agent dirs. Built-in
 * agents live under `src/extensions/agents/builtin` (never these dirs), so they're
 * inherently un-deletable here. Returns the paths actually removed (empty = none found).
 */
export async function deleteAgentFile(name: string, dirs: { userDir: string; projectDir: string }): Promise<string[]> {
  // Slugify the same way create does (so the name the user sees can delete the file
  // create wrote) AND so the value can't contain `..`/separators.
  const slug = slugifyAgentName(name)
  if (!slug) return []
  const removed: string[] = []
  for (const dir of [dirs.projectDir, dirs.userDir]) {
    const file = path.join(dir, `${slug}.md`)
    // Belt-and-suspenders: never unlink anything that isn't directly inside the agents dir.
    const rel = path.relative(dir, file)
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue
    try {
      await fs.unlink(file)
      removed.push(file)
    } catch {
      // not present in this dir → nothing to remove
    }
  }
  return removed
}

export interface DiscoverAgentsOptions {
  builtinDir: string
  userDir: string
  projectDir: string
}

/** Discover agents with precedence project > user > builtin, deduped by name. */
export async function discoverAgents(opts: DiscoverAgentsOptions): Promise<LoadedAgent[]> {
  const [builtin, user, project] = await Promise.all([
    loadAgents(opts.builtinDir),
    loadAgents(opts.userDir),
    loadAgents(opts.projectDir),
  ])
  return discoverWithPrecedence([[...builtin.values()], [...user.values()], [...project.values()]], (a) => a.name)
}

export class AgentRegistry {
  private byName = new Map<string, LoadedAgent>()
  constructor(agents: LoadedAgent[]) {
    for (const a of agents) this.byName.set(a.name, a)
  }
  all(): LoadedAgent[] {
    return [...this.byName.values()]
  }
  get(name: string): LoadedAgent | undefined {
    return this.byName.get(name)
  }
}
