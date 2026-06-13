import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { StorageError } from "@shared/errors"

/**
 * Build the `icacls` argument vector that locks a file down to a single user on
 * Windows: `/inheritance:r` drops every inherited ACE (Administrators, SYSTEM,
 * other profiles) and `/grant:r user:F` re-grants full control to the owner only.
 * This is the Windows equivalent of `chmod 0600`.
 *
 * Returns `null` on non-Windows platforms (those use `chmod`). Pure + exported so
 * the argv is unit-testable without actually shelling out. The `platform` arg
 * defaults to the live platform; tests pass it explicitly.
 */
export function windowsLockdownArgv(
  file: string,
  username: string,
  platform: string = process.platform,
): string[] | null {
  if (platform !== "win32") return null
  return [file, "/inheritance:r", "/grant:r", `${username}:F`]
}

/**
 * Restrict a file to its owner. POSIX: `chmod 0600`. Windows: best-effort `icacls`
 * (strip inheritance, grant the current user full control only) — the chmod mode
 * passed to `writeFileSync` is a silent no-op on NTFS, so the file would otherwise
 * inherit the parent's ACL (readable by other admins). Best-effort everywhere:
 * never throws, since a permissions failure must not lose the write itself.
 */
export function restrictToOwner(file: string): void {
  if (process.platform === "win32") {
    try {
      const argv = windowsLockdownArgv(file, os.userInfo().username)
      if (argv) spawnSync("icacls", argv, { stdio: "ignore" })
    } catch {
      // best-effort — the file still lives under the user profile (ACL-private by default)
    }
    return
  }
  try {
    fs.chmodSync(file, 0o600)
  } catch {
    // best-effort — POSIX perms don't apply on every filesystem
  }
}

// Write/create failures we can explain better than a raw errno. Each maps to a
// human reason + a hint pointing at the one knob the user actually controls.
const FS_WRITE_ERRORS: Record<string, { reason: string; hint: string }> = {
  EACCES: {
    reason: "permission denied",
    hint: "Make the directory writable, or set QUANTCEPT_CONFIG_DIR to a path you own.",
  },
  EPERM: {
    reason: "operation not permitted",
    hint: "Make the directory writable, or set QUANTCEPT_CONFIG_DIR to a path you own.",
  },
  EROFS: { reason: "the filesystem is read-only", hint: "Set QUANTCEPT_CONFIG_DIR to a writable location." },
  ENOSPC: { reason: "no space left on the device", hint: "Free up disk space and try again." },
}

/**
 * Translate a Node fs error into a readable {@link StorageError} when it is a
 * write/create failure we can explain (permission, read-only FS, disk full).
 * Any other error is returned unchanged so callers rethrow the original. Pure +
 * exported for testing.
 */
export function translateFsWriteError(err: unknown, target: string): unknown {
  const code = (err as { code?: string } | null)?.code
  const info = code ? FS_WRITE_ERRORS[code] : undefined
  if (!info) return err
  return new StorageError(`Cannot write Quantcept data to "${target}": ${info.reason}. ${info.hint}`)
}

/**
 * Create the parent directory (0700) and write a file owner-only (0600 + ACL
 * lockdown via {@link restrictToOwner}). A permission/read-only/disk-full failure
 * surfaces as a readable {@link StorageError} naming the path, not a raw errno
 * stack. The owner-restriction step stays best-effort and never masks the write.
 */
export function writeOwnerFile(file: string, contents: string): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    fs.writeFileSync(file, contents, { mode: 0o600 })
  } catch (e) {
    throw translateFsWriteError(e, file)
  }
  restrictToOwner(file)
}
