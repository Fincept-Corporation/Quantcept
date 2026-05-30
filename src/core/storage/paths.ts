import { existsSync, mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const CONFIG_DIR_NAME = ".quantcept"

/** Root of all Quantcept on-disk state. Override with QUANTCEPT_CONFIG_DIR. */
export function configRoot(): string {
  return process.env.QUANTCEPT_CONFIG_DIR ?? path.join(os.homedir(), CONFIG_DIR_NAME)
}

export function dataDir(): string {
  return path.join(configRoot(), "data")
}
export function stateDir(): string {
  return path.join(configRoot(), "state")
}
export function dbFile(): string {
  return path.join(dataDir(), "quantcept.db")
}
export function sessionsDir(projectHashValue: string): string {
  return path.join(dataDir(), "sessions", projectHashValue)
}
export function sessionFile(projectHashValue: string, sessionId: string): string {
  return path.join(sessionsDir(projectHashValue), `${sessionId}.jsonl`)
}
export function jobsDir(projectHashValue: string): string {
  return path.join(dataDir(), "jobs", projectHashValue)
}
export function jobFile(projectHashValue: string, jobId: string): string {
  return path.join(jobsDir(projectHashValue), `${jobId}.jsonl`)
}
export function promptHistoryFile(): string {
  return path.join(stateDir(), "prompt-history.jsonl")
}
/** Append-only external-action (order) audit log for a project. */
export function riskAuditFile(projectHashValue: string): string {
  return path.join(dataDir(), "risk", projectHashValue, "audit.jsonl")
}

/** Create a directory (and parents) if missing. Idempotent. */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// 32-bit FNV-1a → 8 hex chars. Stable, dependency-free.
function hash8(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

/** Walk up from `start` looking for a `.git` dir; return that root, else `start`. */
function gitRootOrSelf(start: string): string {
  let dir = path.resolve(start)
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return path.resolve(start)
    dir = parent
  }
}

/** Stable per-project key (git root if any, else cwd) for grouping sessions. */
export function projectHash(cwd: string = process.cwd()): string {
  return hash8(gitRootOrSelf(cwd))
}
