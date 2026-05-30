// src/tui/context/plugins.tsx

import { HookRegistry } from "@core/hooks/registry"
import { type PluginContributions, PluginManager } from "@core/plugins"
import { logger } from "@shared/logger"
import { createResource } from "solid-js"
import { createSimpleContext } from "./helper"

function emptyContributions(): PluginContributions {
  return {
    plugins: [],
    skills: [],
    commands: [],
    agents: [],
    mcpServers: {},
    hookRegistry: new HookRegistry(),
    contextText: [],
  }
}

/**
 * Loads every enabled plugin's contributions once (skills/commands/agents/MCP/hooks/context) and
 * exposes them reactively. The skills/agents/command contexts merge these in; the session route
 * starts plugin MCP servers, fires lifecycle hooks, and drives the /plugin command via `manager`.
 */
export const { use: usePlugins, provider: PluginsProvider } = createSimpleContext({
  name: "Plugins",
  init: () => {
    const manager = new PluginManager({ projectDir: process.cwd() })
    const [contrib, { refetch }] = createResource(async () => {
      try {
        return await manager.loadEnabled()
      } catch (error) {
        logger.warn("plugin contribution load failed", { error: String(error) })
        return emptyContributions()
      }
    })
    const c = (): PluginContributions => contrib() ?? emptyContributions()

    return {
      manager,
      contributions: c,
      skills: () => c().skills,
      agents: () => c().agents,
      commands: () => c().commands,
      mcpServers: () => c().mcpServers,
      hookRegistry: () => c().hookRegistry,
      contextText: () => c().contextText,
      reload: () => {
        void refetch()
      },
      ready: true,
    }
  },
})
