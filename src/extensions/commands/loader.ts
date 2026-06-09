import { discoverWithPrecedence, loadManifestDir } from "@core/manifest/load"
import { parseFrontmatter } from "@shared/frontmatter"
import fs from "fs/promises"
import path from "path"
import { substituteArgs } from "./arguments"
import type { Command, CommandSource, PromptCommand } from "./types"

function makePromptCommand(name: string, raw: string, source: CommandSource): PromptCommand {
  const { data, body } = parseFrontmatter(raw)
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined)
  const template = body.trim()
  const description = str(data.description) || template.split("\n")[0]?.slice(0, 80) || name
  return {
    kind: "prompt",
    id: `${source}:${name}`,
    name: str(data.name) || name,
    description,
    argumentHint: str(data["argument-hint"]),
    source,
    getPrompt(args) {
      return substituteArgs(template, args)
    },
  }
}

async function loadDir(dir: string, source: CommandSource): Promise<PromptCommand[]> {
  return loadManifestDir({
    dir,
    kind: "file",
    parse: async (file) => makePromptCommand(path.basename(file, ".md"), await fs.readFile(file, "utf8"), source),
  })
}

export interface DiscoverOptions {
  userDir: string
  projectDir: string
}

export async function discoverFileCommands(opts: DiscoverOptions): Promise<Command[]> {
  const userCmds = await loadDir(path.join(opts.userDir, "commands"), "user")
  const projectCmds = await loadDir(path.join(opts.projectDir, "commands"), "project")
  return discoverWithPrecedence<Command>([userCmds, projectCmds], (c) => c.name)
}
