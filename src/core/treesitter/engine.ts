import { grammarWasm, runtimeWasm } from "./grammars"
import type { Capture, Lang, QMatch, Span } from "./types"

// web-tree-sitter is loaded lazily; its types are not depended upon.
// biome-ignore lint/suspicious/noExplicitAny: web-tree-sitter Parser/Language/Query/Node types
type Any = any

let mod: Any = null
let initPromise: Promise<void> | null = null
const langCache = new Map<Lang, Any>()
const parserCache = new Map<Lang, Any>()
const queryCache = new Map<string, Any>()

async function init(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      mod = await import("web-tree-sitter")
      await mod.Parser.init({ locateFile: () => runtimeWasm })
    })()
  }
  return initPromise
}

/** Release a parsed tree's wasm allocation. No-op for null or a tree without delete(). */
export function freeTree(tree: Any): void {
  try {
    tree?.delete?.()
  } catch {
    // best-effort cleanup; never fatal
  }
}

/** Convert a web-tree-sitter node into a pure Span. */
export function spanOf(node: Any): Span {
  return {
    byteStart: node.startIndex,
    byteEnd: node.endIndex,
    startRow: node.startPosition.row,
    startCol: node.startPosition.column,
    endRow: node.endPosition.row,
    endCol: node.endPosition.column,
    text: node.text,
  }
}

/** Parse text in a language. Returns null on any failure so callers can fall back. */
export async function parse(text: string, lang: Lang): Promise<Any | null> {
  try {
    await init()
    let language = langCache.get(lang)
    if (!language) {
      language = await mod.Language.load(grammarWasm(lang))
      langCache.set(lang, language)
    }
    let parser = parserCache.get(lang)
    if (!parser) {
      parser = new mod.Parser()
      parser.setLanguage(language)
      parserCache.set(lang, parser)
    }
    return parser.parse(text)
  } catch {
    return null
  }
}

function compile(scm: string, lang: Lang): Any | null {
  const language = langCache.get(lang)
  if (!language || !mod) return null
  const key = `${lang} ${scm}`
  let q = queryCache.get(key)
  if (!q) {
    q = new mod.Query(language, scm)
    queryCache.set(key, q)
  }
  return q
}

/** Run an .scm query and return named captures (flat, document order). [] on any failure. */
export function query(tree: Any, scm: string, lang: Lang): Capture[] {
  try {
    const q = compile(scm, lang)
    if (!q) return []
    return q.captures(tree.rootNode).map((c: Any) => ({ name: c.name, span: spanOf(c.node), node: c.node }))
  } catch {
    return []
  }
}

/** Run an .scm query and return captures grouped per pattern match. [] on any failure. */
export function queryMatches(tree: Any, scm: string, lang: Lang): QMatch[] {
  try {
    const q = compile(scm, lang)
    if (!q) return []
    return q.matches(tree.rootNode).map((m: Any) => ({
      captures: m.captures.map((c: Any) => ({ name: c.name, span: spanOf(c.node), node: c.node })),
    }))
  } catch {
    return []
  }
}
