import { existsSync } from "node:fs"
import path from "node:path"

/**
 * Locate the computer-use sidecar binary. Returns the first existing candidate, or null
 * (computer-use stays disabled when the binary isn't present). Order: explicit env override →
 * a dev build in the repo → a binary bundled next to the running executable.
 */
export function resolveSidecarBinary(candidates?: string[]): string | null {
  const list = candidates ?? defaultCandidates()
  for (const c of list) {
    if (c && existsSync(c)) return c
  }
  return null
}

function exeName(): string {
  return process.platform === "win32" ? "quantcept-computeruse.exe" : "quantcept-computeruse"
}

function defaultCandidates(): string[] {
  const name = exeName()
  const repo = process.cwd()
  return [
    process.env.QUANTCEPT_COMPUTERUSE_BIN ?? "",
    path.join(repo, "sidecar", "computeruse", "target", "release", name),
    path.join(repo, "sidecar", "computeruse", "target", "debug", name),
    // bundled alongside the launcher in a published install
    path.join(repo, "bin", name),
  ]
}
