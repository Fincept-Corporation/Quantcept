import fs from "node:fs/promises"
import path from "node:path"
import { logger } from "@shared/logger"

/**
 * Load a directory of manifest entries into typed models — the ONE place the
 * "readdir → filter → parse → skip-and-warn on a bad entry" loop lives (skills,
 * agents, slash commands all re-derived it before). A single malformed entry is
 * logged and skipped, never crashing the whole directory; a missing dir → `[]`.
 *
 * `kind: "file"` iterates files (default match: `*.md`); `kind: "dir"` iterates
 * subdirectories (default match: any directory). `parse` receives the absolute
 * entry path (the file for "file", the subdir for "dir") and may throw to skip.
 */
export interface LoadManifestDirOpts<T> {
  dir: string
  kind: "file" | "dir"
  parse: (entryPath: string) => Promise<T> | T
  match?: (entryName: string) => boolean
}

export async function loadManifestDir<T>(opts: LoadManifestDirOpts<T>): Promise<T[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(opts.dir)
  } catch {
    return [] // missing/unreadable directory is not an error
  }
  const out: T[] = []
  for (const entry of entries) {
    const entryPath = path.join(opts.dir, entry)
    try {
      if (opts.kind === "file") {
        if (!(opts.match ? opts.match(entry) : entry.endsWith(".md"))) continue
      } else {
        if (!(await fs.stat(entryPath)).isDirectory()) continue
        if (opts.match && !opts.match(entry)) continue
      }
      out.push(await opts.parse(entryPath))
    } catch (error) {
      logger.warn("skipping manifest entry", {
        entry: entryPath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return out
}

/**
 * Merge layered manifest results into one list with later layers overriding earlier
 * ones by `key` — the canonical builtin/bundled < user < project precedence, deduped.
 * Pass layers low-to-high priority: `discoverWithPrecedence([builtin, user, project], k)`.
 */
export function discoverWithPrecedence<T>(layers: T[][], key: (t: T) => string): T[] {
  const byKey = new Map<string, T>()
  for (const layer of layers) for (const item of layer) byKey.set(key(item), item)
  return [...byKey.values()]
}
