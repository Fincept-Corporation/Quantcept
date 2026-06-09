import fs from "node:fs/promises"
import path from "node:path"
import { loadAgentFromFile } from "@core/agent/agent-load"
import type { LoadedAgent } from "@core/agent/agent-manifest"
import { type HookConfig, normalizeHookConfig } from "@core/hooks/types"
import { type McpServer, McpServerSchema } from "@core/mcp/config"
import { loadSkillFromDir } from "@core/skills/load"
import type { LoadedSkill } from "@core/skills/manifest"
import { parseFrontmatter } from "@shared/frontmatter"
import { logger } from "@shared/logger"
import { type InterpolateVars, interpolateDeep } from "./interpolate"
import type { PluginCommand } from "./manifest"

function toArray(v: string | string[] | undefined): string[] | undefined {
  if (v == null) return undefined
  return Array.isArray(v) ? v : [v]
}

async function listFiles(dir: string, ext: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir)
    return entries.filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f))
  } catch {
    return []
  }
}

/** Resolve a manifest override (or a default subdir) into a flat list of matching files. */
async function collectFiles(
  dir: string,
  override: string | string[] | undefined,
  defaultSub: string,
  ext: string,
): Promise<string[]> {
  const targets = toArray(override)?.map((p) => path.resolve(dir, p)) ?? [path.join(dir, defaultSub)]
  const files: string[] = []
  for (const t of targets) {
    try {
      const st = await fs.stat(t)
      if (st.isDirectory()) files.push(...(await listFiles(t, ext)))
      else if (t.endsWith(ext)) files.push(t)
    } catch {
      // missing target is fine
    }
  }
  return files
}

/** Skills are ADDITIVE: always scan ./skills, plus any manifest-declared skill dirs. */
export async function loadSkillDirs(dir: string, override: string | string[] | undefined): Promise<LoadedSkill[]> {
  const roots = [path.join(dir, "skills"), ...(toArray(override)?.map((p) => path.resolve(dir, p)) ?? [])]
  const out: LoadedSkill[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    let entries: string[]
    try {
      entries = await fs.readdir(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      const sd = path.join(root, entry)
      try {
        if (!(await fs.stat(sd)).isDirectory()) continue
        const s = await loadSkillFromDir(sd)
        if (!seen.has(s.name)) {
          seen.add(s.name)
          out.push(s)
        }
      } catch {
        // skip non-skill dirs
      }
    }
  }
  return out
}

/** Markdown slash commands (neutral + claude). `commands` override REPLACES ./commands. */
export async function loadMarkdownCommands(
  dir: string,
  override: string | string[] | undefined,
): Promise<PluginCommand[]> {
  const files = await collectFiles(dir, override, "commands", ".md")
  const out: PluginCommand[] = []
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8")
      const { data, body } = parseFrontmatter(raw)
      const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined)
      const name = str(data.name) || path.basename(file, ".md")
      out.push({
        name,
        description: str(data.description) || body.trim().split("\n")[0]?.slice(0, 80),
        argumentHint: str(data["argument-hint"]),
        body: body.trim(),
      })
    } catch (e) {
      logger.warn("skipping plugin command", { file, error: String(e) })
    }
  }
  return out
}

/** Markdown agents. `agents` override REPLACES ./agents. */
export async function loadAgentFiles(dir: string, override: string | string[] | undefined): Promise<LoadedAgent[]> {
  const files = await collectFiles(dir, override, "agents", ".md")
  const out: LoadedAgent[] = []
  for (const file of files) {
    try {
      out.push(await loadAgentFromFile(file))
    } catch (e) {
      logger.warn("skipping invalid plugin agent", { file, error: String(e) })
    }
  }
  return out
}

function mergeHookConfigs(a: HookConfig, b: HookConfig): HookConfig {
  const out: HookConfig = { ...a }
  for (const [event, groups] of Object.entries(b) as [keyof HookConfig, HookConfig[keyof HookConfig]][]) {
    if (!groups) continue
    out[event] = [...(out[event] ?? []), ...groups]
  }
  return out
}

/** Load hooks: inline object, file path(s), or the default ./hooks/hooks.json. */
export async function loadHooks(
  dir: string,
  manifestHooks: string | string[] | Record<string, unknown> | undefined,
): Promise<HookConfig> {
  if (manifestHooks && typeof manifestHooks === "object" && !Array.isArray(manifestHooks)) {
    try {
      return normalizeHookConfig(manifestHooks)
    } catch (e) {
      logger.warn("invalid inline plugin hooks", { dir, error: String(e) })
      return {}
    }
  }
  const paths = toArray(manifestHooks as string | string[] | undefined) ?? [path.join("hooks", "hooks.json")]
  let merged: HookConfig = {}
  for (const rel of paths) {
    try {
      const raw = JSON.parse(await fs.readFile(path.resolve(dir, rel), "utf8"))
      merged = mergeHookConfigs(merged, normalizeHookConfig(raw))
    } catch {
      // missing/invalid hooks file → skip
    }
  }
  return merged
}

/** Normalize a foreign MCP entry (claude/gemini/neutral) into a shape McpServerSchema accepts. */
export function normalizeMcpEntry(raw: unknown): unknown {
  if (raw && typeof raw === "object") {
    const e = raw as Record<string, unknown>
    if (e.command) return { type: "stdio", command: e.command, args: e.args, env: e.env, timeout: e.timeout }
    const url = e.url ?? e.httpUrl
    if (url) {
      const transport = e.type === "sse" ? "sse" : e.type === "http" ? "http" : (e.transport ?? "auto")
      return { type: "http", url, headers: e.headers, transport, auth: e.auth, timeout: e.timeout }
    }
  }
  return raw
}

/** Load MCP servers: inline record, a path string, or the default ./.mcp.json. Keys namespaced. */
export async function loadMcpServers(
  dir: string,
  manifestMcp: string | Record<string, unknown> | undefined,
  pluginName: string,
  vars: InterpolateVars,
): Promise<Record<string, McpServer>> {
  let raw: Record<string, unknown> = {}
  if (typeof manifestMcp === "string") {
    try {
      raw = JSON.parse(await fs.readFile(path.resolve(dir, manifestMcp), "utf8"))
    } catch {
      raw = {}
    }
  } else if (manifestMcp && typeof manifestMcp === "object") {
    raw = manifestMcp
  } else {
    try {
      raw = JSON.parse(await fs.readFile(path.join(dir, ".mcp.json"), "utf8"))
    } catch {
      raw = {}
    }
  }
  if (raw.mcpServers && typeof raw.mcpServers === "object") raw = raw.mcpServers as Record<string, unknown>

  const out: Record<string, McpServer> = {}
  for (const [name, entry] of Object.entries(raw)) {
    const normalized = normalizeMcpEntry(interpolateDeep(entry, vars))
    const parsed = McpServerSchema.safeParse(normalized)
    if (!parsed.success) {
      logger.warn("skipping plugin MCP server", { plugin: pluginName, server: name, error: parsed.error.message })
      continue
    }
    out[`${pluginName}__${name}`] = parsed.data
  }
  return out
}

/** Concatenate context files (GEMINI.md/CLAUDE.md) into one block, or undefined if none. */
export async function loadContextText(
  dir: string,
  contextFiles: string | string[] | undefined,
  defaults: string[],
): Promise<string | undefined> {
  const names = toArray(contextFiles) ?? defaults
  const parts: string[] = []
  for (const name of names) {
    try {
      parts.push((await fs.readFile(path.resolve(dir, name), "utf8")).trim())
    } catch {
      // missing context file → skip
    }
  }
  return parts.length ? parts.join("\n\n") : undefined
}
