import { logger } from "@shared/logger"
import fs from "fs"
import { projectSettingsFile, userSettingsFile } from "./paths"
import { type Config, ConfigSchema, defaultConfig } from "./schema"

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base }
  for (const key of Object.keys(override ?? {})) {
    const o = (override as any)[key]
    const b = (base as any)[key]
    out[key] = o && typeof o === "object" && !Array.isArray(o) && b && typeof b === "object" ? deepMerge(b, o) : o
  }
  return out
}

export function mergeConfig(base: Config, user: DeepPartial<Config>, project: DeepPartial<Config>): Config {
  return deepMerge(deepMerge(base, user), project)
}

export function applyEnvOverrides(config: Config, env: Record<string, string | undefined>): Config {
  const provider = { ...config.provider }
  if (env.LLM_MODEL) provider.model = env.LLM_MODEL
  if (env.LLM_BASE_URL) provider.baseUrl = env.LLM_BASE_URL
  if (env.LLM_API_KEY) provider.apiKey = env.LLM_API_KEY
  else if (env.MINIMAX_API_KEY) provider.apiKey = env.MINIMAX_API_KEY
  const next: Config = { ...config, provider }
  // Let the vision provider's key live in env (e.g. OPENAI_API_KEY) instead of a settings file.
  if (next.visionProvider && !next.visionProvider.apiKey && env.OPENAI_API_KEY) {
    next.visionProvider = { ...next.visionProvider, apiKey: env.OPENAI_API_KEY }
  }
  return next
}

function readJsonIfExists(file: string): DeepPartial<Config> {
  try {
    if (!fs.existsSync(file)) return {}
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (e) {
    logger.warn("failed to read settings file", { file, error: String(e) })
    return {}
  }
}

export function loadConfig(cwd?: string): Config {
  const merged = mergeConfig(
    defaultConfig,
    readJsonIfExists(userSettingsFile()),
    readJsonIfExists(projectSettingsFile(cwd)),
  )
  const withEnv = applyEnvOverrides(merged, process.env)
  return ConfigSchema.parse(withEnv)
}
