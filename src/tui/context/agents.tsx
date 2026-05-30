// src/tui/context/agents.tsx

import { join } from "node:path"
import type { LoadedAgent } from "@core/agent/agent-manifest"
import { AgentRegistry, discoverAgents } from "@core/agent/agents"
import { projectConfigDir, userConfigDir } from "@core/config/paths"
import { logger } from "@shared/logger"
import { createResource } from "solid-js"
import { createSimpleContext } from "./helper"
import { usePlugins } from "./plugins"

const BUILTIN_DIR = join(import.meta.dir, "..", "..", "extensions", "agents", "builtin")

export const { use: useAgents, provider: AgentsProvider } = createSimpleContext({
  name: "Agents",
  init: () => {
    const plugins = usePlugins()
    const [registry] = createResource(async () => {
      try {
        const agents = await discoverAgents({
          builtinDir: BUILTIN_DIR,
          userDir: join(userConfigDir(), "agents"),
          projectDir: join(projectConfigDir(), "agents"),
        })
        return new AgentRegistry(agents)
      } catch (error) {
        logger.warn("agent discovery failed", { error: String(error) })
        return new AgentRegistry([])
      }
    })
    // Plugin agents (namespaced plugin:agent) join discovered ones; discovery wins on name.
    const merged = (): LoadedAgent[] => {
      const byName = new Map<string, LoadedAgent>()
      for (const a of plugins.agents()) byName.set(a.name, a)
      for (const a of registry()?.all() ?? []) byName.set(a.name, a)
      return [...byName.values()]
    }
    return {
      all(): LoadedAgent[] {
        return merged()
      },
      get(name: string): LoadedAgent | undefined {
        return merged().find((a) => a.name === name)
      },
      ready: true,
    }
  },
})
