import { projectSettingsFile } from "@core/config/paths"
import { logger } from "@shared/logger"
import fs from "fs"
import path from "path"
import type { McpServer } from "./config"

// Read project settings.json, tolerating a missing or corrupt file (→ {}). A corrupt file is
// effectively replaced on the next write; we log so the loss isn't silent.
function readSettings(file: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(file)) return {}
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>
  } catch (e) {
    logger.warn("failed to read settings.json; treating as empty", { file, error: String(e) })
    return {}
  }
}

function writeSettings(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

// Persist a server under mcp.servers in the project settings file, preserving every other
// key. The spec is stored verbatim, so ${ENV} secret placeholders stay literal (never the
// resolved value).
export function writeServerToSettings(name: string, config: McpServer, cwd?: string): void {
  const file = projectSettingsFile(cwd)
  const settings = readSettings(file)
  const mcp = (settings.mcp as { servers?: Record<string, unknown> } | undefined) ?? {}
  const servers = mcp.servers ?? {}
  servers[name] = config
  mcp.servers = servers
  settings.mcp = mcp
  writeSettings(file, settings)
}

// Remove a server from mcp.servers; a no-op if the file/section/entry is absent.
export function removeServerFromSettings(name: string, cwd?: string): void {
  const file = projectSettingsFile(cwd)
  if (!fs.existsSync(file)) return
  const settings = readSettings(file)
  const servers = (settings.mcp as { servers?: Record<string, unknown> } | undefined)?.servers
  if (servers && name in servers) {
    delete servers[name]
    writeSettings(file, settings)
  }
}
