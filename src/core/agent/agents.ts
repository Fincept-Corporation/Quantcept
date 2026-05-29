import fs from "node:fs/promises"
import path from "node:path"
import { loadAgentFromFile } from "./agent-load"
import type { LoadedAgent } from "./agent-manifest"

/** Load every .md agent definition in `dir` into a map keyed by agent name. Missing dir → empty map. */
export async function loadAgents(dir: string): Promise<Map<string, LoadedAgent>> {
  const map = new Map<string, LoadedAgent>()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return map
  }
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue
    try {
      const agent = await loadAgentFromFile(path.join(dir, entry))
      map.set(agent.name, agent)
    } catch {
      // skip invalid agent files
    }
  }
  return map
}

export interface DiscoverAgentsOptions {
  builtinDir: string
  userDir: string
  projectDir: string
}

/** Discover agents with precedence project > user > builtin, deduped by name. */
export async function discoverAgents(opts: DiscoverAgentsOptions): Promise<LoadedAgent[]> {
  const builtin = await loadAgents(opts.builtinDir)
  const user = await loadAgents(opts.userDir)
  const project = await loadAgents(opts.projectDir)
  const byName = new Map<string, LoadedAgent>()
  for (const [name, a] of builtin) byName.set(name, a)
  for (const [name, a] of user) byName.set(name, a)
  for (const [name, a] of project) byName.set(name, a)
  return [...byName.values()]
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
