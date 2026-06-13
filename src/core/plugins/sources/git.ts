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
  // Harden against argument injection: a value starting with '-' is parsed by git as an option
  // (e.g. --upload-pack=<cmd>), and ext::/fd:: transports run arbitrary commands at clone time.
  for (const [name, value] of Object.entries(opts)) {
    if (typeof value === "string" && value.startsWith("-")) {
      throw new QuantceptError(`git ${name} may not start with '-': ${value}`, "PLUGIN")
    }
  }
  if (/^(ext|fd)::/i.test(opts.url)) {
    throw new QuantceptError(`unsupported git url transport: ${opts.url}`, "PLUGIN")
  }

  const cloneArgs = ["clone", "--depth", "1"]
  if (opts.ref) cloneArgs.push("--branch", opts.ref)
  cloneArgs.push("--", opts.url, destDir) // end-of-options: url/destDir can never be read as flags
  await git(spawn, cloneArgs)

  if (opts.sha) {
    await git(spawn, ["fetch", "--depth", "1", "origin", opts.sha], destDir)
    await git(spawn, ["checkout", opts.sha], destDir)
  }

  if (opts.subdir) relocateSubdir(destDir, opts.subdir)
}

/** Move <destDir>/<subdir> contents up into destDir, then drop the now-empty subdir. */
function relocateSubdir(destDir: string, subdir: string): void {
  const root = path.resolve(destDir)
  const src = path.resolve(destDir, subdir)
  if (src !== root && !src.startsWith(root + path.sep)) {
    throw new QuantceptError(`plugin subdir escapes the plugin directory: ${subdir}`, "PLUGIN")
  }
  for (const entry of fs.readdirSync(src)) {
    fs.renameSync(path.join(src, entry), path.join(destDir, entry))
  }
  fs.rmSync(src, { recursive: true, force: true })
}
