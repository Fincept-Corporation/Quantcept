import { pluginStateFile } from "@core/config/paths"
import { QuantceptError } from "@shared/errors"
import { logger } from "@shared/logger"
import fs from "fs"
import path from "path"

/** A plugin fetched + unpacked into `dir`; `source` is a marketplace PluginSource. */
export interface InstalledPlugin {
  name: string
  source: unknown
  marketplace?: string
  version?: string
  dir: string
  enabled: boolean
}

/** A registered marketplace catalog source. */
export interface KnownMarketplace {
  name: string
  source: unknown
}

/** The whole on-disk plugin state. */
export interface PluginState {
  marketplaces: Record<string, KnownMarketplace>
  installed: Record<string, InstalledPlugin>
}

const EMPTY: PluginState = { marketplaces: {}, installed: {} }

// Persists known marketplaces + installed/enabled plugins as pretty JSON. Every mutation
// rewrites the whole file; read() tolerates a missing or corrupt file by returning empty state.
export class PluginStateStore {
  constructor(private readonly file: string = pluginStateFile()) {}

  read(): PluginState {
    try {
      if (!fs.existsSync(this.file)) return structuredClone(EMPTY)
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<PluginState>
      return { marketplaces: parsed.marketplaces ?? {}, installed: parsed.installed ?? {} }
    } catch (e) {
      logger.warn("failed to read plugin state; treating as empty", { file: this.file, error: String(e) })
      return structuredClone(EMPTY)
    }
  }

  private write(state: PluginState): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file, JSON.stringify(state, null, 2))
  }

  private mutate(fn: (s: PluginState) => void): void {
    const state = this.read()
    fn(state)
    this.write(state)
  }

  addMarketplace(m: KnownMarketplace): void {
    this.mutate((s) => {
      s.marketplaces[m.name] = m
    })
  }

  removeMarketplace(name: string): void {
    this.mutate((s) => {
      delete s.marketplaces[name]
    })
  }

  listMarketplaces(): KnownMarketplace[] {
    return Object.values(this.read().marketplaces)
  }

  setInstalled(p: InstalledPlugin): void {
    this.mutate((s) => {
      s.installed[p.name] = p
    })
  }

  removeInstalled(name: string): void {
    this.mutate((s) => {
      delete s.installed[name]
    })
  }

  listInstalled(): InstalledPlugin[] {
    return Object.values(this.read().installed)
  }

  setEnabled(name: string, on: boolean): void {
    this.mutate((s) => {
      const p = s.installed[name]
      if (!p) throw new QuantceptError(`plugin not installed: ${name}`, "PLUGIN")
      p.enabled = on
    })
  }

  enabledNames(): string[] {
    return this.listInstalled()
      .filter((p) => p.enabled)
      .map((p) => p.name)
  }
}
