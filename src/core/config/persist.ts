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
  // 0700 dir / 0600 file: settings.json holds secrets (LLM + Fincept API keys),
  // so keep it owner-only. mode on create only; chmod covers a pre-existing file.
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  try {
    fs.chmodSync(file, 0o600)
  } catch {
    // best-effort — POSIX perms don't apply on Windows
  }
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

export interface FinceptAuthSettings {
  baseUrl?: string
  apiKey?: string
  userId?: string
  email?: string
  username?: string
  lastValidatedAt?: string
}

/** Read the persisted fincept block from a settings file (default: user settings). */
export function getFinceptAuth(file: string = userSettingsFile()): FinceptAuthSettings | undefined {
  const s = readSettingsFile(file)
  return (s.fincept as FinceptAuthSettings) ?? undefined
}

/**
 * Merge auth fields into the fincept block of the USER settings file — kept out of any project
 * repo so the API key is never committed (same rule as setVisionProvider). Preserves other settings.
 */
export function setFinceptAuth(patch: FinceptAuthSettings, file: string = userSettingsFile()): void {
  const settings = readSettingsFile(file)
  settings.fincept = { ...(settings.fincept as object), ...patch }
  writeSettingsFile(file, settings)
}

/** Drop the stored key + account fields on logout, keeping only baseUrl. */
export function clearFinceptAuth(file: string = userSettingsFile()): void {
  const settings = readSettingsFile(file)
  const prev = (settings.fincept as FinceptAuthSettings) ?? {}
  settings.fincept = { baseUrl: prev.baseUrl }
  writeSettingsFile(file, settings)
}
