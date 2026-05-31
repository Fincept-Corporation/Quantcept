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

// ── Generic user-settings editor (backing the in-TUI Settings modal) ─────────
// All writes target the USER settings file (never project), at 0600.

/** Read the raw user settings.json object (defaults are not merged in). */
export function getUserSettings(file: string = userSettingsFile()): Record<string, unknown> {
  return readSettingsFile(file)
}

/** Read → mutate → write the user settings object. */
export function updateUserSettings(
  mutate: (s: Record<string, unknown>) => void,
  file: string = userSettingsFile(),
): void {
  const s = readSettingsFile(file)
  mutate(s)
  writeSettingsFile(file, s)
}

/** Set a dot-path (e.g. "provider.model") in user settings, creating intermediate objects. */
export function setUserSettingPath(pathStr: string, value: unknown, file: string = userSettingsFile()): void {
  updateUserSettings((s) => {
    const keys = pathStr.split(".")
    let obj = s as Record<string, unknown>
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!
      if (typeof obj[k] !== "object" || obj[k] === null) obj[k] = {}
      obj = obj[k] as Record<string, unknown>
    }
    obj[keys[keys.length - 1]!] = value
  }, file)
}

/** Delete a dot-path from user settings (e.g. clear an optional section). */
export function clearUserSettingPath(pathStr: string, file: string = userSettingsFile()): void {
  updateUserSettings((s) => {
    const keys = pathStr.split(".")
    let obj = s as Record<string, unknown>
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!
      if (typeof obj[k] !== "object" || obj[k] === null) return
      obj = obj[k] as Record<string, unknown>
    }
    delete obj[keys[keys.length - 1]!]
  }, file)
}
