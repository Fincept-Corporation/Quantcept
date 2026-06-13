import path from "node:path"

export interface InterpolateVars {
  /** Absolute path to the plugin install dir. */
  pluginRoot?: string
  /** Project root the CLI launched in. */
  projectDir?: string
  /** Environment used for ${ENV} tokens (defaults to process.env). */
  env?: Record<string, string | undefined>
}

// One internal model, three ecosystems: Claude (CLAUDE_PLUGIN_ROOT), gemini (extensionPath),
// and our own (PLUGIN_ROOT / QUANTCEPT_PLUGIN_ROOT) all resolve to the plugin dir.
const PLUGIN_ROOT_KEYS = new Set(["CLAUDE_PLUGIN_ROOT", "QUANTCEPT_PLUGIN_ROOT", "PLUGIN_ROOT", "extensionPath"])
const PROJECT_DIR_KEYS = new Set(["CLAUDE_PROJECT_DIR", "QUANTCEPT_PROJECT_DIR", "workspacePath"])

// A plugin manifest must not be able to pull the host's own credentials into an MCP server's
// args/headers/env and ship them to a plugin-controlled endpoint. Refuse to interpolate the app's
// own secret env names, or ANY env value shaped like an API key / Fincept session token — while
// still allowing ordinary env tokens a server legitimately needs (e.g. ${TOKEN}=abc).
const BLOCKED_ENV_NAME = /^(LLM_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY|MINIMAX_API_KEY)$/i
const SECRET_VALUE = /^sk-[A-Za-z0-9]{12,}|fk_user_[A-Za-z0-9._-]+/

/** Substitute `${...}` tokens in one string. Unknown tokens are left verbatim. */
export function interpolate(value: string, vars: InterpolateVars): string {
  const env = vars.env ?? process.env
  return value.replace(/\$\{([^}]+)\}/g, (match, raw) => {
    const key = String(raw).trim()
    if (key === "/") return path.sep // gemini's ${/} path separator
    if (PLUGIN_ROOT_KEYS.has(key)) return vars.pluginRoot ?? match
    if (PROJECT_DIR_KEYS.has(key)) return vars.projectDir ?? match
    if (Object.hasOwn(env, key)) {
      const v = env[key] ?? ""
      // Leave the token verbatim (don't leak the secret) rather than substituting it.
      if (BLOCKED_ENV_NAME.test(key) || SECRET_VALUE.test(v)) return match
      return v
    }
    return match
  })
}

/** Recursively interpolate every string in a value, leaving non-strings intact. */
export function interpolateDeep<T>(value: T, vars: InterpolateVars): T {
  if (typeof value === "string") return interpolate(value, vars) as unknown as T
  if (Array.isArray(value)) return value.map((v) => interpolateDeep(v, vars)) as unknown as T
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = interpolateDeep(v, vars)
    return out as T
  }
  return value
}
