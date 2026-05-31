import { rm } from "node:fs/promises"
import type { LoadedAgent } from "@core/agent/agent-manifest"
import { HookRegistry } from "@core/hooks/registry"
import type { McpServer } from "@core/mcp/config"
import type { LoadedSkill } from "@core/skills/manifest"
import { QuantceptError } from "@shared/errors"
import { logger } from "@shared/logger"
import { type InstalledResult, type InstallOptions, installPlugin } from "./install"
import { type LoadPluginOptions, loadPluginFromDir } from "./load"
import type { LoadedPlugin, PluginCommand } from "./manifest"
import { type Marketplace, type PluginSource, parsePluginSource } from "./marketplace"
import { fetchMarketplace } from "./registry-client"
import { type InstalledPlugin, PluginStateStore } from "./state"

/** Everything enabled plugins contribute to the running session, namespaced and merged. */
export interface PluginContributions {
  plugins: LoadedPlugin[]
  skills: LoadedSkill[]
  commands: PluginCommand[]
  agents: LoadedAgent[]
  mcpServers: Record<string, McpServer>
  hookRegistry: HookRegistry
  contextText: string[]
}

export interface PluginManagerDeps {
  state?: PluginStateStore
  projectDir?: string
  env?: Record<string, string | undefined>
  install?: (source: PluginSource, opts: InstallOptions) => Promise<InstalledResult>
  fetchMarketplace?: (source: PluginSource) => Promise<Marketplace>
  load?: (dir: string, opts?: LoadPluginOptions) => Promise<LoadedPlugin>
}

/** Orchestrates marketplaces, install/enable lifecycle, and aggregation of plugin contributions. */
export class PluginManager {
  private readonly state: PluginStateStore
  private readonly deps: PluginManagerDeps

  constructor(deps: PluginManagerDeps = {}) {
    this.state = deps.state ?? new PluginStateStore()
    this.deps = deps
  }

  private fetchMp(source: PluginSource): Promise<Marketplace> {
    return (this.deps.fetchMarketplace ?? fetchMarketplace)(source)
  }

  /** Register a marketplace from any source string and return its (adapted) catalog. */
  async addMarketplace(sourceSpec: string): Promise<Marketplace> {
    const mp = await this.fetchMp(parsePluginSource(sourceSpec))
    this.state.addMarketplace({ name: mp.name, source: sourceSpec })
    return mp
  }

  removeMarketplace(name: string): void {
    this.state.removeMarketplace(name)
  }

  listMarketplaces() {
    return this.state.listMarketplaces()
  }

  /** Fetch a known marketplace's catalog so a UI can browse available plugins before installing. */
  async browseMarketplace(name: string): Promise<Marketplace> {
    const known = this.state.listMarketplaces().find((m) => m.name === name)
    if (!known) throw new QuantceptError(`Unknown marketplace: ${name}`, "PLUGIN")
    return this.fetchMp(parsePluginSource(known.source as string))
  }

  /** Install a plugin by `name@marketplace`, or directly from any source string. */
  async install(spec: string, opts: { enable?: boolean } = {}): Promise<InstalledPlugin> {
    let source: PluginSource
    let marketplace: string | undefined
    let version: string | undefined

    const at = spec.lastIndexOf("@")
    const isNameAtMarketplace = at > 0 && !spec.includes("://") && !spec.startsWith("npm:") && !spec.includes("/")
    if (isNameAtMarketplace) {
      const pluginName = spec.slice(0, at)
      marketplace = spec.slice(at + 1)
      const known = this.state.listMarketplaces().find((m) => m.name === marketplace)
      if (!known) throw new QuantceptError(`Unknown marketplace: ${marketplace}`, "PLUGIN")
      const mp = await this.fetchMp(parsePluginSource(known.source as string))
      const entry = mp.plugins.find((p) => p.name === pluginName)
      if (!entry) throw new QuantceptError(`Plugin "${pluginName}" not found in ${marketplace}`, "PLUGIN")
      source = parsePluginSource(entry.source)
      version = entry.version
    } else {
      source = parsePluginSource(spec)
    }

    const install = this.deps.install ?? installPlugin
    const res = await install(source, { marketplace, version, projectDir: this.deps.projectDir })
    const installed: InstalledPlugin = {
      name: res.plugin.name,
      source,
      marketplace,
      version: res.plugin.version ?? version,
      dir: res.dir,
      enabled: opts.enable ?? true,
    }
    this.state.setInstalled(installed)
    return installed
  }

  async uninstall(name: string): Promise<void> {
    const installed = this.state.read().installed[name]
    if (installed) await rm(installed.dir, { recursive: true, force: true }).catch(() => {})
    this.state.removeInstalled(name)
  }

  enable(name: string): void {
    this.state.setEnabled(name, true)
  }

  disable(name: string): void {
    this.state.setEnabled(name, false)
  }

  listInstalled(): InstalledPlugin[] {
    return this.state.listInstalled()
  }

  /** Load every enabled plugin and merge its components into namespaced contributions. */
  async loadEnabled(): Promise<PluginContributions> {
    const load = this.deps.load ?? loadPluginFromDir
    const out: PluginContributions = {
      plugins: [],
      skills: [],
      commands: [],
      agents: [],
      mcpServers: {},
      hookRegistry: new HookRegistry(),
      contextText: [],
    }
    for (const inst of this.state.listInstalled()) {
      if (!inst.enabled) continue
      let p: LoadedPlugin
      try {
        p = await load(inst.dir, { projectDir: this.deps.projectDir, env: this.deps.env })
      } catch (e) {
        logger.warn("failed to load enabled plugin", { name: inst.name, error: String(e) })
        continue
      }
      out.plugins.push(p)
      for (const s of p.skills) out.skills.push({ ...s, name: `${p.name}:${s.name}` })
      for (const c of p.commands) out.commands.push({ ...c, name: `${p.name}:${c.name}` })
      for (const a of p.agents) out.agents.push({ ...a, name: `${p.name}:${a.name}` })
      Object.assign(out.mcpServers, p.mcpServers)
      out.hookRegistry.add(p.name, p.hooks)
      if (p.contextText) out.contextText.push(p.contextText)
    }
    return out
  }
}
