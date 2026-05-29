import { logger } from "@shared/logger"
import fs from "fs/promises"
import path from "path"
import { substituteArgs } from "./arguments"
import type { Command, CommandSource, PromptCommand } from "./types"

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const content = raw.replace(/\r\n/g, "\n")
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content)
  if (!match) return { data: {}, body: content }
  const data: Record<string, string> = {}
  const lines = match[1]!.split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    i++
    if (/^\s/.test(line) || line.trim() === "") continue // skip stray indented/blank lines
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (value === "") {
      // Folded scalar: collect following indented (or blank) lines until the next top-level key.
      const parts: string[] = []
      while (i < lines.length && (/^\s/.test(lines[i]!) || lines[i]!.trim() === "")) {
        const cont = lines[i]!.trim()
        if (cont !== "") parts.push(cont)
        i++
      }
      value = parts.join(" ")
    }
    data[key] = value
  }
  return { data, body: match[2] ?? "" }
}

function briefError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  return msg.replace(/\s+/g, " ").trim().slice(0, 120)
}

function makePromptCommand(name: string, raw: string, source: CommandSource): PromptCommand {
  const { data, body } = parseFrontmatter(raw)
  const template = body.trim()
  const description = data.description || template.split("\n")[0]?.slice(0, 80) || name
  return {
    kind: "prompt",
    id: `${source}:${name}`,
    name: data.name || name,
    description,
    argumentHint: data["argument-hint"],
    source,
    getPrompt(args) {
      return substituteArgs(template, args)
    },
  }
}

async function loadDir(dir: string, source: CommandSource): Promise<PromptCommand[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: PromptCommand[] = []
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue
    const name = entry.slice(0, -3)
    try {
      const raw = await fs.readFile(path.join(dir, entry), "utf8")
      out.push(makePromptCommand(name, raw, source))
    } catch (error) {
      logger.warn(`Skipping command file ${entry}: ${briefError(error)}`)
    }
  }
  return out
}

export interface DiscoverOptions {
  userDir: string
  projectDir: string
}

export async function discoverFileCommands(opts: DiscoverOptions): Promise<Command[]> {
  const userCmds = await loadDir(path.join(opts.userDir, "commands"), "user")
  const projectCmds = await loadDir(path.join(opts.projectDir, "commands"), "project")
  const byName = new Map<string, Command>()
  for (const c of userCmds) byName.set(c.name, c)
  for (const c of projectCmds) byName.set(c.name, c)
  return [...byName.values()]
}
