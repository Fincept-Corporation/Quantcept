import fs from "node:fs/promises"
import path from "node:path"
import { logger } from "@shared/logger"
import { type PluginCommand, PluginManifestSchema } from "../manifest"
import type { AdaptResult } from "./types"

/**
 * gemini-cli extension (gemini-extension.json). Map its fields onto the neutral manifest;
 * commands are TOML (handled by loadTomlCommands), context defaults to GEMINI.md.
 */
export async function adaptGemini(_dir: string, manifestPath: string): Promise<AdaptResult> {
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8"))
  const manifest = PluginManifestSchema.parse({
    name: raw.name,
    version: raw.version,
    description: raw.description,
    mcpServers: raw.mcpServers,
    contextFiles: raw.contextFileName,
  })
  const contextDefaults = raw.contextFileName ? [] : ["GEMINI.md"]
  return { manifest, format: "gemini", commandFormat: "toml", contextDefaults }
}

/** Extract `prompt`/`description` from a gemini TOML command (basic + multiline strings). */
export function parseTomlCommand(raw: string): { prompt?: string; description?: string } {
  const out: { prompt?: string; description?: string } = {}
  for (const key of ["prompt", "description"] as const) {
    const triple = new RegExp(`^${key}\\s*=\\s*"""([\\s\\S]*?)"""`, "m").exec(raw)
    if (triple) {
      out[key] = triple[1]!.trim()
      continue
    }
    const dq = new RegExp(`^${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(raw)
    if (dq) {
      out[key] = dq[1]!.replace(/\\"/g, '"')
      continue
    }
    const sq = new RegExp(`^${key}\\s*=\\s*'([^']*)'`, "m").exec(raw)
    if (sq) out[key] = sq[1]
  }
  return out
}

/** gemini uses {{args}}; translate to our $ARGUMENTS placeholder. */
function translateBody(prompt: string): string {
  return prompt.replace(/\{\{\s*args\s*\}\}/g, "$ARGUMENTS")
}

async function listToml(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir)
    return entries.filter((f) => f.endsWith(".toml")).map((f) => path.join(dir, f))
  } catch {
    return []
  }
}

/** Load gemini TOML slash commands from ./commands (or a manifest override). */
export async function loadTomlCommands(dir: string, override: string | string[] | undefined): Promise<PluginCommand[]> {
  const targets = (Array.isArray(override) ? override : override ? [override] : undefined)?.map((p) =>
    path.resolve(dir, p),
  ) ?? [path.join(dir, "commands")]
  const files: string[] = []
  for (const t of targets) {
    try {
      if ((await fs.stat(t)).isDirectory()) files.push(...(await listToml(t)))
      else if (t.endsWith(".toml")) files.push(t)
    } catch {
      // missing target → skip
    }
  }
  const out: PluginCommand[] = []
  for (const file of files) {
    try {
      const { prompt, description } = parseTomlCommand(await fs.readFile(file, "utf8"))
      if (!prompt) continue
      out.push({ name: path.basename(file, ".toml"), description, body: translateBody(prompt) })
    } catch (e) {
      logger.warn("skipping gemini toml command", { file, error: String(e) })
    }
  }
  return out
}
