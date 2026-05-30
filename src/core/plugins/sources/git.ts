import fs from "node:fs"
import path from "node:path"
import { QuantceptError } from "@shared/errors"

/** Injectable spawn: returns captured exit/stdout/stderr so tests never invoke real git. */
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>

const defaultSpawn: SpawnFn = async (cmd, args, opts) => {
  const proc = Bun.spawn([cmd, ...args], { cwd: opts?.cwd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
    new Response(proc.stderr as ReadableStream<Uint8Array>).text(),
  ])
  await proc.exited
  return { exitCode: proc.exitCode ?? 0, stdout, stderr }
}

async function git(spawn: SpawnFn, args: string[], cwd?: string): Promise<void> {
  const { exitCode, stderr } = await spawn("git", args, cwd ? { cwd } : undefined)
  if (exitCode !== 0) {
    throw new QuantceptError(`git ${args[0]} failed (exit ${exitCode}): ${stderr.trim()}`, "PLUGIN")
  }
}

/** Shallow-clone a git repo into destDir; optionally pin to a sha and lift a subdir to the root. */
export async function fetchGit(
  opts: { url: string; ref?: string; sha?: string; subdir?: string },
  destDir: string,
  spawn: SpawnFn = defaultSpawn,
): Promise<void> {
  const cloneArgs = ["clone", "--depth", "1"]
  if (opts.ref) cloneArgs.push("--branch", opts.ref)
  cloneArgs.push(opts.url, destDir)
  await git(spawn, cloneArgs)

  if (opts.sha) {
    await git(spawn, ["fetch", "--depth", "1", "origin", opts.sha], destDir)
    await git(spawn, ["checkout", opts.sha], destDir)
  }

  if (opts.subdir) relocateSubdir(destDir, opts.subdir)
}

/** Move <destDir>/<subdir> contents up into destDir, then drop the now-empty subdir. */
function relocateSubdir(destDir: string, subdir: string): void {
  const src = path.join(destDir, subdir)
  for (const entry of fs.readdirSync(src)) {
    fs.renameSync(path.join(src, entry), path.join(destDir, entry))
  }
  fs.rmSync(src, { recursive: true, force: true })
}
