import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { isGitAvailable, runGit } from "./git"

const SIZE_CAP = 2 * 1024 * 1024 // 2 MB

export interface FileDiff {
  file: string
  status: "A" | "M" | "D"
  additions: number
  deletions: number
  patch: string
}

/**
 * Drives an isolated git repo to snapshot/restore a worktree. The repo lives at
 * `gitDir`, its work tree is `workTree` (the user's project). The user's own
 * `.git` is never touched. All ops no-op (return null/[]) if git is unavailable.
 */
export class SnapshotEngine {
  constructor(
    private workTree: string,
    private gitDir: string,
  ) {}

  private git(args: string[]) {
    return runGit(args, { gitDir: this.gitDir, workTree: this.workTree, cwd: this.workTree })
  }

  /** Create the snapshot repo if absent. Safe to call repeatedly. */
  init(): void {
    if (!isGitAvailable()) return
    if (!existsSync(this.gitDir)) mkdirSync(this.gitDir, { recursive: true })
    if (!existsSync(join(this.gitDir, "HEAD"))) {
      runGit(["init"], { cwd: this.workTree, gitDir: this.gitDir, workTree: this.workTree })
      this.git(["config", "core.autocrlf", "false"])
      this.git(["config", "core.longpaths", "true"])
    }
    this.syncIgnores()
  }

  /**
   * Sync the user's ignore rules into the snapshot repo's info/exclude so that
   * `git add --all` never snapshots node_modules / build output. We fold in the
   * worktree's top-level .gitignore and the user's real .git/info/exclude.
   * (`git add --all` also honors nested .gitignore files in the worktree.)
   */
  private syncIgnores(): void {
    const sources = [join(this.workTree, ".gitignore"), join(this.workTree, ".git", "info", "exclude")]
    const parts: string[] = []
    for (const src of sources) {
      try {
        if (existsSync(src)) parts.push(readFileSync(src, "utf8"))
      } catch {
        // unreadable — skip
      }
    }
    try {
      const infoDir = join(this.gitDir, "info")
      mkdirSync(infoDir, { recursive: true })
      writeFileSync(join(infoDir, "exclude"), parts.join("\n"))
    } catch {
      // best-effort
    }
  }

  /** Exclude oversized files so they never enter the tree. */
  private excludeLargeFiles(): void {
    const ls = this.git(["ls-files", "--others", "--modified", "--exclude-standard", "-z"])
    const files = ls.stdout.split("\0").filter(Boolean)
    const excludePath = join(this.gitDir, "info", "exclude")
    for (const f of files) {
      try {
        if (statSync(join(this.workTree, f)).size > SIZE_CAP) {
          if (existsSync(excludePath)) appendFileSync(excludePath, `\n${f}\n`)
        }
      } catch {
        // file vanished between listing and stat — ignore
      }
    }
  }

  /** Snapshot the worktree → tree hash, or null if git is unavailable. */
  track(_label?: string): string | null {
    if (!isGitAvailable()) return null
    this.excludeLargeFiles()
    this.git(["add", "--all"])
    const r = this.git(["write-tree"])
    if (r.code !== 0) return null
    const hash = r.stdout.trim()
    return /^[a-f0-9]{40}$/.test(hash) ? hash : null
  }

  /** Restore the whole worktree to a snapshot tree. */
  restore(treeHash: string): void {
    if (!isGitAvailable()) return
    this.git(["read-tree", treeHash])
    this.git(["checkout-index", "-a", "-f"])
  }

  /** Revert specific files to a snapshot; delete files not present in that tree. */
  revert(treeHash: string, files: string[]): void {
    if (!isGitAvailable()) return
    for (const f of files) {
      const inTree = this.git(["ls-tree", treeHash, "--", f])
      if (inTree.stdout.trim()) {
        this.git(["checkout", treeHash, "--", f])
      } else {
        try {
          const abs = join(this.workTree, f)
          if (existsSync(abs)) rmSync(abs, { force: true })
        } catch {
          // ignore
        }
      }
    }
  }

  /** Structured diff between a snapshot tree and the current worktree. */
  diff(treeHash: string): FileDiff[] {
    if (!isGitAvailable()) return []
    this.excludeLargeFiles()
    this.git(["add", "--all"])
    const nameStatus = this.git(["diff", "--cached", "--name-status", "--no-renames", treeHash])
    if (nameStatus.code !== 0) return []
    const numstat = this.git(["diff", "--cached", "--numstat", treeHash])
    const counts = new Map<string, { add: number; del: number }>()
    for (const line of numstat.stdout.split("\n")) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim())
      if (m) counts.set(m[3]!, { add: m[1] === "-" ? 0 : Number(m[1]), del: m[2] === "-" ? 0 : Number(m[2]) })
    }
    const out: FileDiff[] = []
    for (const line of nameStatus.stdout.split("\n")) {
      const m = /^([AMD])\t(.+)$/.exec(line.trim())
      if (!m) continue
      const status = m[1] as "A" | "M" | "D"
      const file = m[2]!
      const patch = this.git(["diff", "--cached", treeHash, "--", file]).stdout
      const c = counts.get(file) ?? { add: 0, del: 0 }
      out.push({ file, status, additions: c.add, deletions: c.del, patch })
    }
    return out
  }

  /** Drop snapshot trees older than 7 days. */
  prune(): void {
    if (!isGitAvailable()) return
    this.git(["gc", "--prune=7.days"])
  }
}
