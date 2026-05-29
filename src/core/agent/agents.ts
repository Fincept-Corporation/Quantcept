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
