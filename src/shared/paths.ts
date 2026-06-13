import os from "node:os"
import path from "node:path"

/** The on-disk config/state directory name, under the user's home by default. */
export const CONFIG_DIR_NAME = ".quantcept"

/**
 * Root of all Quantcept user-level on-disk state (settings.json, the data tree,
 * logs, plugins, MCP auth tokens). Defaults to `~/.quantcept`; override with
 * `QUANTCEPT_CONFIG_DIR` so the *whole* tree relocates together.
 *
 * This is the single source of truth: both `core/config/paths` (settings/plugins/
 * mcp-auth) and `core/storage/paths` (db/sessions/logs) derive from it, so the
 * settings dir and the data dir can never diverge when the env var is set.
 *
 * NOTE: the knowledge corpus dir (`core/knowledge/corpus.ts`) intentionally does
 * NOT use this — it is pinned to `os.homedir()` to stay byte-identical with the Go
 * learnings sidecar's write path (which probes the home dir, not this env var).
 */
export function configRoot(): string {
  return process.env.QUANTCEPT_CONFIG_DIR ?? path.join(os.homedir(), CONFIG_DIR_NAME)
}
