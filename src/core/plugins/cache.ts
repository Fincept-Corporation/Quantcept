import { mkdir } from "node:fs/promises"
import path from "node:path"
import { pluginCacheDir } from "@core/config/paths"

type CacheKey = { marketplace?: string; plugin: string; version?: string }

/** Replace anything outside [A-Za-z0-9._-] with "-" so a key is a safe path segment. */
function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "-")
}

/** Absolute cache dir for a plugin: pluginCacheDir()/<marketplace>/<plugin>/<version>. */
export function pluginCachePath(opts: CacheKey): string {
  return path.join(
    pluginCacheDir(),
    sanitize(opts.marketplace ?? "_local"),
    sanitize(opts.plugin),
    sanitize(opts.version ?? "unknown"),
  )
}

/** mkdir -p the cache dir and return its path. */
export async function ensurePluginCacheDir(opts: CacheKey): Promise<string> {
  const p = pluginCachePath(opts)
  await mkdir(p, { recursive: true })
  return p
}
