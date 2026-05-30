import fs from "node:fs/promises"
import path from "node:path"
import { QuantceptError } from "@shared/errors"

/**
 * Install a local plugin source into destDir.
 * link → symlink destDir at the source (dev install); else recursively copy its contents.
 */
export async function fetchLocal(src: { path: string }, destDir: string, opts?: { link?: boolean }): Promise<void> {
  const abs = path.resolve(process.cwd(), src.path)

  const stat = await fs.stat(abs).catch(() => null)
  if (!stat?.isDirectory()) {
    throw new QuantceptError(`local plugin path is not a directory: ${src.path}`, "PLUGIN")
  }

  if (opts?.link) {
    await fs.mkdir(path.dirname(destDir), { recursive: true })
    // junction on win32 (dir-only, no elevation needed); dir symlink elsewhere
    await fs.symlink(abs, destDir, process.platform === "win32" ? "junction" : "dir")
    return
  }

  await fs.mkdir(destDir, { recursive: true })
  await fs.cp(abs, destDir, { recursive: true })
}
