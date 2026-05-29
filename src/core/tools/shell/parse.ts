import type { ShellKind } from "./args"
import { labelFor } from "./labels"
import { tokenizeCommands } from "./tokenize"

export interface CommandPart {
  name: string
  text: string
  label: string
  risky: boolean
}

// biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter Language/Node types are not depended upon
type AnyLang = any
let cache: { bash: AnyLang; ps: AnyLang } | null | undefined

async function parsers(): Promise<{ bash: AnyLang; ps: AnyLang } | null> {
  if (cache !== undefined) return cache
  try {
    const { Parser, Language } = await import("web-tree-sitter")
    await Parser.init()
    const fs = await import("node:fs")
    const bashWasm = Bun.resolveSync("tree-sitter-bash/tree-sitter-bash.wasm", process.cwd())
    const psDir = "node_modules/tree-sitter-powershell"
    const psFile = fs.readdirSync(psDir).find((f) => f.endsWith(".wasm"))
    if (!psFile) {
      cache = null
      return cache
    }
    const [bash, ps] = await Promise.all([Language.load(bashWasm), Language.load(`${psDir}/${psFile}`)])
    cache = { bash, ps }
    return cache
  } catch {
    cache = null
    return cache
  }
}

function nameOf(node: AnyLang): string {
  return node.childForFieldName?.("name")?.text ?? node.child(0)?.text ?? node.text.trim().split(/\s+/)[0] ?? ""
}

function toPart(name: string, text: string): CommandPart {
  const { label, risky } = labelFor(name)
  return { name, text, label, risky }
}

function fallbackParts(command: string): CommandPart[] {
  return tokenizeCommands(command).map((seg) => toPart(seg[0] ?? "", seg.join(" ")))
}

export async function describeCommand(command: string, kind: ShellKind): Promise<CommandPart[]> {
  try {
    const p = await parsers()
    const lang = kind === "powershell" ? p?.ps : kind === "posix" ? p?.bash : null
    if (!p || !lang) return fallbackParts(command)
    const { Parser } = await import("web-tree-sitter")
    const parser = new Parser()
    parser.setLanguage(lang)
    const tree = parser.parse(command)
    const cmds = tree?.rootNode.descendantsOfType("command") ?? []
    if (!cmds.length) return fallbackParts(command)
    return cmds.filter(Boolean).map((c: AnyLang) => toPart(nameOf(c), c.text))
  } catch {
    return fallbackParts(command)
  }
}
