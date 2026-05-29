export interface GitOpts {
  gitDir?: string
  workTree?: string
  cwd?: string
}

export interface GitResult {
  code: number
  stdout: string
  stderr: string
}

/** Run a git command synchronously. Never throws — returns the exit code. */
export function runGit(args: string[], opts: GitOpts): GitResult {
  const full = [
    "git",
    ...(opts.gitDir ? ["--git-dir", opts.gitDir] : []),
    ...(opts.workTree ? ["--work-tree", opts.workTree] : []),
    ...args,
  ]
  try {
    const p = Bun.spawnSync(full, { cwd: opts.cwd ?? opts.workTree, stdout: "pipe", stderr: "pipe" })
    return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() }
  } catch (e) {
    return { code: 1, stdout: "", stderr: e instanceof Error ? e.message : String(e) }
  }
}

let cachedAvailable: boolean | undefined
/** True if `git` is on PATH. Cached after first probe. */
export function isGitAvailable(): boolean {
  if (cachedAvailable === undefined) cachedAvailable = runGit(["--version"], {}).code === 0
  return cachedAvailable
}
