import path from "node:path"
import { QuantceptError } from "@shared/errors"
import { adaptClaude } from "./adapters/claude"
import { adaptGemini, loadTomlCommands } from "./adapters/gemini"
import { adaptNeutral } from "./adapters/neutral"
import {
  loadAgentFiles,
  loadContextText,
  loadHooks,
  loadMarkdownCommands,
  loadMcpServers,
  loadSkillDirs,
} from "./components"
import { detectPluginFormat } from "./detect"
import type { InterpolateVars } from "./interpolate"
import type { LoadedPlugin } from "./manifest"

export interface LoadPluginOptions {
  projectDir?: string
  env?: Record<string, string | undefined>
}

/** Detect a plugin's format, adapt its manifest to neutral, and load every component. */
export async function loadPluginFromDir(dir: string, opts: LoadPluginOptions = {}): Promise<LoadedPlugin> {
  const det = await detectPluginFormat(dir)
  if (!det) throw new QuantceptError(`No plugin manifest found in ${dir}`, "PLUGIN")
  const adapt = det.format === "claude" ? adaptClaude : det.format === "gemini" ? adaptGemini : adaptNeutral
  const { manifest, format, commandFormat, contextDefaults } = await adapt(dir, det.manifestPath)
  const name = manifest.name ?? path.basename(dir)
  const vars: InterpolateVars = { pluginRoot: dir, projectDir: opts.projectDir, env: opts.env }

  const [skills, commands, agents, hooks, mcpServers, contextText] = await Promise.all([
    loadSkillDirs(dir, manifest.skills),
    commandFormat === "toml" ? loadTomlCommands(dir, manifest.commands) : loadMarkdownCommands(dir, manifest.commands),
    loadAgentFiles(dir, manifest.agents),
    loadHooks(dir, manifest.hooks),
    loadMcpServers(dir, manifest.mcpServers, name, vars),
    loadContextText(dir, manifest.contextFiles, contextDefaults),
  ])

  return {
    name,
    dir,
    format,
    version: manifest.version,
    manifest,
    skills,
    commands,
    agents,
    mcpServers,
    hooks,
    contextText,
  }
}
