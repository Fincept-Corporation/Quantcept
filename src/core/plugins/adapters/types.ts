import type { PluginFormat, PluginManifest } from "../manifest"

export interface AdaptResult {
  manifest: PluginManifest
  format: PluginFormat
  /** Slash-command file format this plugin ships. */
  commandFormat: "md" | "toml"
  /** Context-file names to try when the manifest declares none. */
  contextDefaults: string[]
}
