import { join } from "node:path"
import { dataDir } from "@core/storage/paths"

export type MemoryScope = "global" | "project"

/** Title → stable filesystem slug. Falls back to "memory" for all-punctuation titles. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "memory"
}

/** Directory for a memory scope. `project` requires a projectHash. */
export function memoryDir(scope: MemoryScope, projectHash?: string): string {
  const leaf = scope === "global" ? "global" : (projectHash ?? "unknown")
  return join(dataDir(), "memory", leaf)
}

export function indexFile(scope: MemoryScope, projectHash?: string): string {
  return join(memoryDir(scope, projectHash), "MEMORY.md")
}

export function topicFile(scope: MemoryScope, projectHash: string | undefined, slug: string): string {
  return join(memoryDir(scope, projectHash), `${slug}.md`)
}
