import fs from "fs/promises"
import path from "path"
import { logger } from "@shared/logger"
import { substituteArgs } from "./arguments"
import type { Command, CommandSource, PromptCommand } from "./types"

function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content)
  if (!match) return { data: {}, body: content }
  const data: Record<string, string> = {}
  for (const line of match[1]!.split("\n")) {
    const idx = line.indexOf(":")
    if (idx === -1) continue
    data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return { data, body: match[2] ?? "" }
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
      logger.warn(`Skipping command file ${entry}: ${error instanceof Error ? error.message : String(error)}`)
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
