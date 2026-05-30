import fs from "node:fs/promises"
import path from "node:path"
import type { PluginFormat } from "./manifest"

export interface DetectResult {
  format: PluginFormat
  manifestPath: string
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Detect which on-disk plugin format a directory holds (claude > gemini > neutral), or null. */
export async function detectPluginFormat(dir: string): Promise<DetectResult | null> {
  const claude = path.join(dir, ".claude-plugin", "plugin.json")
  if (await exists(claude)) return { format: "claude", manifestPath: claude }
  const gemini = path.join(dir, "gemini-extension.json")
  if (await exists(gemini)) return { format: "gemini", manifestPath: gemini }
  for (const name of ["quantcept-plugin.json", "plugin.json"]) {
    const p = path.join(dir, name)
    if (await exists(p)) return { format: "neutral", manifestPath: p }
  }
  return null
}
