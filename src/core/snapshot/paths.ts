import { join } from "node:path"
import { dataDir } from "@core/storage/paths"

/** Isolated git dir for a project's snapshots (never the user's real .git). */
export function snapshotGitDir(projectHash: string): string {
  return join(dataDir(), "snapshot", projectHash)
}
