import type { LoadedAgent } from "@core/agent/agent-manifest"
import type { HookConfig } from "@core/hooks/types"
import type { McpServer } from "@core/mcp/config"
import type { LoadedSkill } from "@core/skills/manifest"
import { z } from "zod/v4"

const PathOrPaths = z.union([z.string(), z.array(z.string())])

const AuthorSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  url: z.string().optional(),
})

const DependencySchema = z.union([z.string(), z.object({ name: z.string(), version: z.string().optional() })])

/**
 * Neutral plugin manifest — a superset that the Claude and gemini adapters normalize into.
 * `.passthrough()` keeps foreign keys (e.g. Claude `$schema`, gemini `themes`/`settings`) so a
 * third-party manifest never fails to parse just because it carries fields we don't model yet.
 */
export const PluginManifestSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().optional(),
    description: z.string().optional(),
    author: z.union([z.string(), AuthorSchema]).optional(),
    homepage: z.string().optional(),
    repository: z.string().optional(),
    license: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    // Component overrides. `skills` is additive to ./skills; commands/agents replace their defaults.
    skills: PathOrPaths.optional(),
    commands: PathOrPaths.optional(),
    agents: PathOrPaths.optional(),
    contextFiles: PathOrPaths.optional(),
    // Lenient on purpose: foreign MCP/hook shapes (Claude `type:"sse"`, gemini `tcp`, etc.) must
    // not fail manifest parse. Real validation happens per-entry at component load.
    hooks: z.union([z.string(), z.array(z.string()), z.record(z.string(), z.unknown())]).optional(),
    mcpServers: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    dependencies: z.array(DependencySchema).optional(),
    defaultEnabled: z.boolean().optional(),
  })
  .passthrough()

export type PluginManifest = z.infer<typeof PluginManifestSchema>

/** Detected on-disk manifest format. */
export type PluginFormat = "neutral" | "claude" | "gemini"

/** A plugin-contributed slash command in neutral form (TUI converts this to a PromptCommand). */
export interface PluginCommand {
  name: string
  description?: string
  argumentHint?: string
  /** Prompt template body; supports $ARGUMENTS / $1 substitution at run time. */
  body: string
}

/** A fully loaded plugin: manifest plus every component resolved into neutral form. */
export interface LoadedPlugin {
  name: string
  dir: string
  format: PluginFormat
  version?: string
  manifest: PluginManifest
  skills: LoadedSkill[]
  commands: PluginCommand[]
  agents: LoadedAgent[]
  /** Namespaced MCP server configs, already interpolated, keyed by `<plugin>__<server>`. */
  mcpServers: Record<string, McpServer>
  hooks: HookConfig
  /** Concatenated context-file text (GEMINI.md/CLAUDE.md) folded into the system prompt. */
  contextText?: string
}
