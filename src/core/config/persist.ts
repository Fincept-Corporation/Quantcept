import fs from "node:fs"
import path from "node:path"
import { userSettingsFile } from "./paths"

/** Read a settings.json, tolerating a missing or corrupt file (→ {}). */
export function readSettingsFile(file: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(file)) return {}
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeSettingsFile(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

export interface VisionProviderSettings {
  id: string
  model: string
  baseUrl: string
  apiKey?: string
}

/**
 * Write the vision provider (which enables computer-use) into the per-USER settings file
 * (`~/.quantcept/settings.json`) — kept out of any project repo so the API key is never
 * committed. Preserves every other setting.
 */
export function setVisionProvider(vp: VisionProviderSettings, file: string = userSettingsFile()): void {
  const settings = readSettingsFile(file)
  settings.visionProvider = vp
  writeSettingsFile(file, settings)
}

export function clearVisionProvider(file: string = userSettingsFile()): void {
  const settings = readSettingsFile(file)
  if ("visionProvider" in settings) {
    delete settings.visionProvider
    writeSettingsFile(file, settings)
  }
}
