import fs from "node:fs"
import type { FinceptSession } from "@core/fincept/types"
import { writeOwnerFile } from "@shared/fsperm"
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
  // settings.json holds secrets (LLM + Fincept API keys): owner-only 0700 dir / 0600
  // file + Windows ACL lockdown, and an unwritable path surfaces as a readable
  // StorageError instead of a raw errno. See @shared/fsperm.writeOwnerFile.
  writeOwnerFile(file, `${JSON.stringify(data, null, 2)}\n`)
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
  sessionToken?: string
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

/**
 * Drop the stored key + account fields on logout. The base URL is fixed to the hosted backend
 * (see applyFinceptHost) and never persisted, so there is nothing to preserve — clear the whole
 * block (which also sheds any stale `baseUrl` a pre-migration install left behind).
 */
export function clearFinceptAuth(file: string = userSettingsFile()): void {
  const settings = readSettingsFile(file)
  settings.fincept = {}
  writeSettingsFile(file, settings)
}

/** Build a FinceptSession from a settings file (default: user settings), or undefined if no key. */
export function sessionFromConfig(file: string = userSettingsFile()): FinceptSession | undefined {
  const f = getFinceptAuth(file)
  return f?.apiKey ? { apiKey: f.apiKey, sessionToken: f.sessionToken } : undefined
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
