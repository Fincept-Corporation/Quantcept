import path from "path"

/** Resolve `p` against `cwd`; throw if the result escapes `cwd`. */
export function resolveInCwd(cwd: string, p: string): string {
  const root = path.resolve(cwd)
  const resolved = path.resolve(root, p)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path escapes workspace: ${p}`)
  }
  return resolved
}
