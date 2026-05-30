export { ensurePluginCacheDir, pluginCachePath } from "./cache"
export { type DetectResult, detectPluginFormat } from "./detect"
export { type InstalledResult, type InstallOptions, installPlugin } from "./install"
export { type InterpolateVars, interpolate, interpolateDeep } from "./interpolate"
export { type LoadPluginOptions, loadPluginFromDir } from "./load"
export { type PluginContributions, PluginManager, type PluginManagerDeps } from "./manager"
export {
  type LoadedPlugin,
  type PluginCommand,
  type PluginFormat,
  type PluginManifest,
  PluginManifestSchema,
} from "./manifest"
export {
  type Marketplace,
  type MarketplacePluginEntry,
  MarketplaceSchema,
  type PluginSource,
  PluginSourceSchema,
  parsePluginSource,
} from "./marketplace"
export { adaptMarketplace, fetchMarketplace, readMarketplaceDir } from "./registry-client"
export { type InstalledPlugin, type KnownMarketplace, type PluginState, PluginStateStore } from "./state"
