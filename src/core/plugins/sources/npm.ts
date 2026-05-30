import { QuantceptError } from "@shared/errors"

const DEFAULT_REGISTRY = "https://registry.npmjs.org"

/** Encode a package name for a packument request; scoped "@a/b" -> "@a%2Fb". */
function encodePackage(name: string): string {
  return name.startsWith("@") ? name.replace("/", "%2F") : encodeURIComponent(name)
}

/** Resolve an npm package to a tarball and hand it to the tarball fetcher. */
export async function fetchNpm(
  src: { package: string; version?: string; registry?: string },
  destDir: string,
  deps?: {
    fetch?: typeof fetch
    fetchTarball?: (s: { url: string }, destDir: string) => Promise<void>
  },
): Promise<void> {
  const doFetch = deps?.fetch ?? fetch
  const registry = (src.registry ?? DEFAULT_REGISTRY).replace(/\/+$/, "")
  const url = `${registry}/${encodePackage(src.package)}`

  const res = await doFetch(url)
  if (!res.ok) throw new QuantceptError(`npm package not found: ${src.package} (${res.status})`, "PLUGIN")

  const pack = (await res.json()) as {
    "dist-tags"?: Record<string, string>
    versions?: Record<string, { dist?: { tarball?: string } }>
  }
  const versions = pack.versions ?? {}

  const version = src.version ?? pack["dist-tags"]?.latest
  if (!version) throw new QuantceptError(`npm package has no latest version: ${src.package}`, "PLUGIN")
  const entry = versions[version]
  if (!entry) throw new QuantceptError(`npm version not found: ${src.package}@${version}`, "PLUGIN")

  const tarball = entry.dist?.tarball
  if (!tarball) throw new QuantceptError(`npm version has no tarball: ${src.package}@${version}`, "PLUGIN")

  // Default fetcher is loaded lazily so injected deps never resolve the sibling module.
  const fetchTarball = deps?.fetchTarball ?? (await import("./tarball")).fetchTarball
  await fetchTarball({ url: tarball }, destDir)
}
