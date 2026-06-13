import { CONFIG_DIR_NAME, configRoot } from "@shared/paths"
import path from "path"

export { CONFIG_DIR_NAME }

export function userConfigDir(): string {
  return configRoot()
}

export function projectConfigDir(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_DIR_NAME)
}

export function userSettingsFile(): string {
  return path.join(userConfigDir(), "settings.json")
}

export function projectSettingsFile(cwd?: string): string {
  return path.join(projectConfigDir(cwd), "settings.json")
}

/** Root for installed plugins + their machine-managed state (under the user config dir). */
export function pluginsDir(): string {
  return path.join(userConfigDir(), "plugins")
}

/** Cache for fetched plugins: pluginsDir/cache/<marketplace>/<plugin>/<version>/. */
export function pluginCacheDir(): string {
  return path.join(pluginsDir(), "cache")
}

/** Known marketplaces + per-plugin enablement state. */
export function pluginStateFile(): string {
  return path.join(pluginsDir(), "state.json")
}
