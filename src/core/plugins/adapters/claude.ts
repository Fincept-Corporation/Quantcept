import fs from "node:fs/promises"
import { PluginManifestSchema } from "../manifest"
import type { AdaptResult } from "./types"

/**
 * Claude Code plugin (.claude-plugin/plugin.json). Its keys (name/version/skills/commands/agents/
 * hooks/mcpServers) already align with the neutral model; the lenient mcpServers/hooks fields plus
 * `.passthrough()` absorb Claude-specific shapes (`type:"sse"`, experimental, $schema, …).
 */
export async function adaptClaude(_dir: string, manifestPath: string): Promise<AdaptResult> {
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8"))
  return { manifest: PluginManifestSchema.parse(raw), format: "claude", commandFormat: "md", contextDefaults: [] }
}
