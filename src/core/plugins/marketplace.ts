import { QuantceptError } from "@shared/errors"
import { z } from "zod/v4"

/** Where a plugin (or a marketplace) is fetched from. */
export const PluginSourceSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("github"),
    repo: z.string(),
    ref: z.string().optional(),
    sha: z.string().optional(),
    path: z.string().optional(),
  }),
  z.object({
    source: z.literal("git"),
    url: z.string(),
    ref: z.string().optional(),
    sha: z.string().optional(),
    path: z.string().optional(),
  }),
  z.object({
    source: z.literal("git-subdir"),
    url: z.string(),
    path: z.string(),
    ref: z.string().optional(),
    sha: z.string().optional(),
  }),
  z.object({
    source: z.literal("npm"),
    package: z.string(),
    version: z.string().optional(),
    registry: z.string().optional(),
  }),
  z.object({ source: z.literal("tarball"), url: z.string() }),
  z.object({ source: z.literal("local"), path: z.string() }),
])
export type PluginSource = z.infer<typeof PluginSourceSchema>

const ARCHIVE_RE = /\.(tgz|tar\.gz|tar)$/i
const ZIP_RE = /\.zip$/i
const URL_RE = /^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/
const OWNER_REPO_RE = /^[\w.-]+\/[\w.-]+$/
const LOCAL_RE = /^(\.\.?[\\/]|~[\\/]?|[\\/])|^[a-zA-Z]:[\\/]/

/**
 * Normalize a string shorthand (or pass an object through validation) into a typed PluginSource.
 * Accepts `github:o/r`, `o/r`, `npm:pkg`, archive URLs, git URLs, and local paths.
 */
export function parsePluginSource(raw: unknown): PluginSource {
  if (raw && typeof raw === "object") return PluginSourceSchema.parse(raw)
  if (typeof raw !== "string") throw new Error("plugin source must be a string or object")
  const s = raw.trim()
  if (s.startsWith("npm:")) return { source: "npm", package: s.slice(4) }
  if (s.startsWith("github:")) return { source: "github", repo: s.slice(7) }
  // .zip is parseable here but the tarball extractor only runs `tar -xf`, which cannot read a
  // zip — reject up front with a clear error instead of failing later with a confusing tar error.
  if (ZIP_RE.test(s)) throw new QuantceptError("zip plugin archives are not supported (use .tar.gz)", "PLUGIN")
  if (LOCAL_RE.test(s)) return { source: "local", path: s }
  if (ARCHIVE_RE.test(s)) return { source: "tarball", url: s }
  if (URL_RE.test(s)) {
    const gh = s.match(/github\.com[/:]+([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
    if (gh && !/\.git$/i.test(s)) return { source: "github", repo: `${gh[1]}/${gh[2]}` }
    return { source: "git", url: s }
  }
  if (OWNER_REPO_RE.test(s)) return { source: "github", repo: s }
  throw new Error(`Unrecognized plugin source: ${s}`)
}

/** One plugin entry in a marketplace catalog. */
export const MarketplacePluginEntrySchema = z
  .object({
    name: z.string().min(1),
    source: z.union([z.string(), PluginSourceSchema]),
    version: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough()
export type MarketplacePluginEntry = z.infer<typeof MarketplacePluginEntrySchema>

/** Neutral marketplace catalog (Claude/gemini registries adapt into this). */
export const MarketplaceSchema = z
  .object({
    name: z.string().min(1),
    owner: z.object({ name: z.string(), email: z.string().optional(), url: z.string().optional() }).optional(),
    description: z.string().optional(),
    plugins: z.array(MarketplacePluginEntrySchema).default([]),
  })
  .passthrough()
export type Marketplace = z.infer<typeof MarketplaceSchema>
