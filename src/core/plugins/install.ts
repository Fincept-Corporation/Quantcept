import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pluginCachePath } from "./cache"
import { type LoadPluginOptions, loadPluginFromDir } from "./load"
import type { LoadedPlugin } from "./manifest"
import type { PluginSource } from "./marketplace"
import { fetchGit } from "./sources/git"
import { fetchLocal } from "./sources/local"
import { fetchNpm } from "./sources/npm"
import { fetchTarball } from "./sources/tarball"

export interface InstallSourceDeps {
  fetchLocal?: typeof fetchLocal
  fetchGit?: typeof fetchGit
  fetchTarball?: typeof fetchTarball
  fetchNpm?: typeof fetchNpm
}

export interface InstallOptions {
  marketplace?: string
  version?: string
  projectDir?: string
  /** Dev link install (symlink) for local sources. */
  link?: boolean
  /** Force the install destination (tests/dev); otherwise the cache path is used. */
  dest?: string
  deps?: InstallSourceDeps
}

export interface InstalledResult {
  dir: string
  plugin: LoadedPlugin
  source: PluginSource
}

/** Fetch a source's contents into destDir using the right transport. */
async function fetchSource(source: PluginSource, destDir: string, opts: InstallOptions): Promise<void> {
  const d = opts.deps ?? {}
  switch (source.source) {
    case "local":
      return (d.fetchLocal ?? fetchLocal)({ path: source.path }, destDir, { link: opts.link })
    case "github":
      return (d.fetchGit ?? fetchGit)(
        { url: `https://github.com/${source.repo}.git`, ref: source.ref, sha: source.sha, subdir: source.path },
        destDir,
      )
    case "git":
    case "git-subdir":
      return (d.fetchGit ?? fetchGit)(
        { url: source.url, ref: source.ref, sha: source.sha, subdir: source.path },
        destDir,
      )
    case "tarball":
      return (d.fetchTarball ?? fetchTarball)({ url: source.url }, destDir)
    case "npm":
      return (d.fetchNpm ?? fetchNpm)(
        { package: source.package, version: source.version, registry: source.registry },
        destDir,
      )
  }
}

async function placeAt(dest: string): Promise<void> {
  await rm(dest, { recursive: true, force: true })
  await mkdir(path.dirname(dest), { recursive: true })
}

const loadOpts = (opts: InstallOptions): LoadPluginOptions => ({ projectDir: opts.projectDir })

/** Fetch a plugin from its source into the cache (or opts.dest) and return the loaded plugin. */
export async function installPlugin(source: PluginSource, opts: InstallOptions = {}): Promise<InstalledResult> {
  // Local: we can read the source in place to learn name/version before placing it.
  if (source.source === "local") {
    const srcDir = path.resolve(opts.projectDir ?? process.cwd(), source.path)
    const peek = await loadPluginFromDir(srcDir, loadOpts(opts))
    const dest =
      opts.dest ??
      pluginCachePath({ marketplace: opts.marketplace, plugin: peek.name, version: opts.version ?? peek.version })
    await placeAt(dest)
    await fetchSource({ source: "local", path: srcDir }, dest, opts)
    const plugin = await loadPluginFromDir(dest, loadOpts(opts))
    return { dir: dest, plugin, source }
  }

  // Remote: stage-fetch into a temp dir, peek, then move into place.
  const staging = await mkdtemp(path.join(os.tmpdir(), "qc-install-"))
  await fetchSource(source, staging, opts)
  const peek = await loadPluginFromDir(staging, loadOpts(opts))
  const dest =
    opts.dest ??
    pluginCachePath({ marketplace: opts.marketplace, plugin: peek.name, version: opts.version ?? peek.version })
  await placeAt(dest)
  await rename(staging, dest).catch(async () => {
    await cp(staging, dest, { recursive: true })
    await rm(staging, { recursive: true, force: true })
  })
  const plugin = await loadPluginFromDir(dest, loadOpts(opts))
  return { dir: dest, plugin, source }
}
