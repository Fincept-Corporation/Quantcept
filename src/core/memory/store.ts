import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { indexFile, type MemoryScope, memoryDir, slugify, topicFile } from "./paths"

interface RememberInput {
  scope: MemoryScope
  projectHash?: string
  title: string
  fact: string
}

interface RecallInput {
  scope: MemoryScope
  projectHash?: string
  title: string
}

function ensureDirFor(file: string): void {
  const dir = dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/** Write a memory: create/append the topic file and upsert its index pointer. */
export function remember(input: RememberInput): { slug: string } {
  const slug = slugify(input.title)
  const topic = topicFile(input.scope, input.projectHash, slug)
  ensureDirFor(topic)
  if (existsSync(topic)) {
    appendFileSync(topic, `- ${input.fact}\n`)
  } else {
    writeFileSync(topic, `# ${input.title}\n\n- ${input.fact}\n`)
  }
  const idxFile = indexFile(input.scope, input.projectHash)
  const pointer = `- [${input.title}](${slug}.md) — ${input.fact.slice(0, 60)}`
  const existing = existsSync(idxFile) ? readFileSync(idxFile, "utf8") : ""
  const hasPointer = existing.split("\n").some((l) => l.includes(`(${slug}.md)`))
  if (!hasPointer) {
    ensureDirFor(idxFile)
    appendFileSync(idxFile, existing.endsWith("\n") || existing === "" ? `${pointer}\n` : `\n${pointer}\n`)
  }
  return { slug }
}

/** Read a topic's full body, or null if it doesn't exist. */
export function recall(input: RecallInput): string | null {
  const topic = topicFile(input.scope, input.projectHash, slugify(input.title))
  if (!existsSync(topic)) return null
  return readFileSync(topic, "utf8")
}

/** The MEMORY.md index text for a scope, or "" if absent. */
export function readIndex(scope: MemoryScope, projectHash?: string): string {
  const idx = indexFile(scope, projectHash)
  if (!existsSync(idx)) return ""
  return readFileSync(idx, "utf8")
}

export interface MemoryEntry {
  slug: string
  title: string
  body: string
}

/** All memories in a scope (reads the topic files; the MEMORY.md index is excluded). */
export function listMemories(scope: MemoryScope, projectHash?: string): MemoryEntry[] {
  const dir = memoryDir(scope, projectHash)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "MEMORY.md")
    .sort()
    .map((f) => {
      const slug = f.slice(0, -3)
      const body = readFileSync(join(dir, f), "utf8")
      const head = body.split("\n").find((l) => l.startsWith("# "))
      return { slug, title: head ? head.slice(2).trim() : slug, body }
    })
}

/** Delete a memory's topic file and remove its index pointer. Returns true if the topic existed. */
export function forget(scope: MemoryScope, projectHash: string | undefined, slug: string): boolean {
  const topic = topicFile(scope, projectHash, slug)
  const existed = existsSync(topic)
  if (existed) rmSync(topic)
  const idx = indexFile(scope, projectHash)
  if (existsSync(idx)) {
    const kept = readFileSync(idx, "utf8")
      .split("\n")
      .filter((l) => !l.includes(`(${slug}.md)`))
    // Atomic replace: write to a sibling temp file then rename over the index so a
    // crash mid-write can't truncate MEMORY.md and concurrent writers can't clobber it.
    const tmp = `${idx}.tmp`
    writeFileSync(tmp, kept.join("\n"))
    renameSync(tmp, idx)
  }
  return existed
}

export { memoryDir }
