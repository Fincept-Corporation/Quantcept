// src/tui/context/agents.tsx

import { join } from "node:path"
import type { LoadedAgent } from "@core/agent/agent-manifest"
import { AgentRegistry, discoverAgents } from "@core/agent/agents"
import { projectConfigDir, userConfigDir } from "@core/config/paths"
import { logger } from "@shared/logger"
import { createResource } from "solid-js"
import { createSimpleContext } from "./helper"

const BUILTIN_DIR = join(import.meta.dir, "..", "..", "extensions", "agents", "builtin")

export const { use: useAgents, provider: AgentsProvider } = createSimpleContext({
  name: "Agents",
  init: () => {
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
    return {
      all(): LoadedAgent[] {
        return registry()?.all() ?? []
      },
      get(name: string): LoadedAgent | undefined {
        return registry()?.get(name)
      },
      ready: true,
    }
  },
})
