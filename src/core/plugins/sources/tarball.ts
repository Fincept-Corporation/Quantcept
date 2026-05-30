import { mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { QuantceptError } from "@shared/errors"

/** Extract an archive into destDir, stripping the single nested top dir (github/npm convention). */
async function defaultExtract(archivePath: string, destDir: string): Promise<void> {
  // .zip is not handled by system tar everywhere — left as a TODO; tar covers tgz/tar.gz/tar.
  const proc = Bun.spawn(["tar", "-xf", archivePath, "-C", destDir, "--strip-components=1"])
  const code = await proc.exited
  if (code !== 0) throw new QuantceptError(`tarball extract failed (tar exit ${code}): ${archivePath}`, "PLUGIN")
}

/** Fetch a tarball URL, stage it to a temp file, and extract it into destDir. */
export async function fetchTarball(
  src: { url: string },
  destDir: string,
  deps?: { fetch?: typeof fetch; extract?: (archivePath: string, destDir: string) => Promise<void> },
): Promise<void> {
  const doFetch = deps?.fetch ?? fetch
  const extract = deps?.extract ?? defaultExtract

  const res = await doFetch(src.url)
  if (!res.ok) throw new QuantceptError(`Failed to fetch tarball ${src.url} (HTTP ${res.status})`, "PLUGIN")

  const bytes = new Uint8Array(await res.arrayBuffer())
  const archivePath = path.join(os.tmpdir(), `qc-tarball-${Date.now()}-${process.pid}.tar`)
  await writeFile(archivePath, bytes)

  await mkdir(destDir, { recursive: true })
  await extract(archivePath, destDir)
}
