import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { QuantceptError } from "@shared/errors"
import { type Marketplace, MarketplaceSchema, type PluginSource, parsePluginSource } from "./marketplace"
import { fetchGit } from "./sources/git"

const MARKETPLACE_FILES = [
  "quantcept-marketplace.json",
  path.join(".claude-plugin", "marketplace.json"),
  "extensions.json",
  "marketplace.json",
]

/** Normalize a raw marketplace manifest (neutral/claude object, or gemini array) into neutral form. */
export function adaptMarketplace(raw: unknown, fallbackName: string, baseDir?: string): Marketplace {
  let mp: Marketplace
  if (Array.isArray(raw)) {
    // gemini registry: an array of RegistryExtension objects.
    const plugins = raw
      .map((e: Record<string, unknown>) => ({
        name: (e.extensionName ?? e.fullName ?? e.id) as string,
        source: (e.url ?? e.fullName) as string,
        description: (e.extensionDescription ?? e.repoDescription) as string | undefined,
        version: e.extensionVersion as string | undefined,
      }))
      .filter((e) => e.name && e.source)
    mp = MarketplaceSchema.parse({ name: fallbackName, plugins })
  } else {
    mp = MarketplaceSchema.parse(raw)
  }
  // Resolve relative local plugin sources against the marketplace's own directory.
  if (baseDir) {
    for (const entry of mp.plugins) {
      try {
        const ps = parsePluginSource(entry.source)
        if (ps.source === "local" && !path.isAbsolute(ps.path)) {
          entry.source = { source: "local", path: path.resolve(baseDir, ps.path) }
        }
      } catch {
        // leave unrecognized sources untouched
      }
    }
  }
  return mp
}

async function findMarketplaceFile(dir: string): Promise<string | null> {
  for (const f of MARKETPLACE_FILES) {
    const p = path.join(dir, f)
    try {
      await fs.access(p)
      return p
    } catch {
      // try next
    }
  }
  return null
}

/** Read + adapt a marketplace manifest from a directory. */
export async function readMarketplaceDir(dir: string): Promise<Marketplace> {
  const file = await findMarketplaceFile(dir)
  if (!file) throw new QuantceptError(`No marketplace manifest found in ${dir}`, "MARKETPLACE")
  const raw = JSON.parse(await fs.readFile(file, "utf8"))
  return adaptMarketplace(raw, path.basename(dir), path.dirname(file))
}

function toGitUrl(source: PluginSource): string {
  if (source.source === "github") return `https://github.com/${source.repo}.git`
  if (source.source === "git" || source.source === "git-subdir") return source.url
  throw new QuantceptError(`Not a git marketplace source: ${source.source}`, "MARKETPLACE")
}

export interface FetchMarketplaceDeps {
  fetch?: typeof fetch
  cloneInto?: (source: PluginSource, destDir: string) => Promise<void>
}

/** Fetch + adapt a marketplace from any source (local dir/file, json URL, or git clone). */
export async function fetchMarketplace(source: PluginSource, deps: FetchMarketplaceDeps = {}): Promise<Marketplace> {
  if (source.source === "local") {
    const st = await fs.stat(source.path).catch(() => null)
    if (st?.isDirectory()) return readMarketplaceDir(source.path)
    const raw = JSON.parse(await fs.readFile(source.path, "utf8"))
    return adaptMarketplace(raw, path.basename(path.dirname(source.path)), path.dirname(source.path))
  }

  const directUrl = "url" in source ? source.url : undefined
  if (source.source === "tarball" || (directUrl && /\.json($|\?)/i.test(directUrl))) {
    const url = directUrl ?? (source as { url: string }).url
    const res = await (deps.fetch ?? fetch)(url)
    if (!res.ok) throw new QuantceptError(`Failed to fetch marketplace: ${url}`, "MARKETPLACE")
    return adaptMarketplace(await res.json(), url)
  }

  // git / github / git-subdir: clone, then read from the (sub)dir.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "qc-mp-"))
  const cloneInto = deps.cloneInto ?? ((s: PluginSource, dest: string) => fetchGit({ url: toGitUrl(s) }, dest))
  await cloneInto(source, tmp)
  const root = source.source === "git-subdir" ? path.join(tmp, source.path) : tmp
  return readMarketplaceDir(root)
}
