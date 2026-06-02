import { parse, query } from "@core/treesitter/engine"
import type { Lang } from "@core/treesitter/types"
import type { ShellKind } from "./args"
import { labelFor } from "./labels"
import { tokenizeCommands } from "./tokenize"

export interface CommandPart {
  name: string
  text: string
  label: string
  risky: boolean
}

// biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter node type is not depended upon
function nameOf(node: any): string {
  return node.childForFieldName?.("name")?.text ?? node.child(0)?.text ?? node.text.trim().split(/\s+/)[0] ?? ""
}

function toPart(name: string, text: string): CommandPart {
  const { label, risky } = labelFor(name)
  return { name, text, label, risky }
}

function fallbackParts(command: string): CommandPart[] {
  return tokenizeCommands(command).map((seg) => toPart(seg[0] ?? "", seg.join(" ")))
}

function langFor(kind: ShellKind): Lang | null {
  return kind === "powershell" ? "powershell" : kind === "posix" ? "bash" : null
}

export async function describeCommand(command: string, kind: ShellKind): Promise<CommandPart[]> {
  const lang = langFor(kind)
  if (!lang) return fallbackParts(command)
  const tree = await parse(command, lang)
  if (!tree) return fallbackParts(command)
  const caps = query(tree, "(command) @cmd", lang)
  if (!caps.length) return fallbackParts(command)
  return caps.map((c) => toPart(nameOf(c.node), c.node.text))
}
