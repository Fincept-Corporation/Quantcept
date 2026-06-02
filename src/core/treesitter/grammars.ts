// WASM is embedded for the compiled binary via Bun's file loader: in dev the import is the
// on-disk path; in the compiled binary Bun auto-embeds the file and the import is its bunfs
// path. One code path for both (verified under Bun — spec §1.1).
import bashWasm from "tree-sitter-bash/tree-sitter-bash.wasm" with { type: "file" }
import powershellWasm from "tree-sitter-powershell/tree-sitter-powershell.wasm" with { type: "file" }
import pythonWasm from "tree-sitter-python/tree-sitter-python.wasm" with { type: "file" }
import runtimeWasmUrl from "web-tree-sitter/tree-sitter.wasm" with { type: "file" }
import type { Lang } from "./types"

const GRAMMARS: Record<Lang, string> = {
  bash: bashWasm,
  powershell: powershellWasm,
  python: pythonWasm,
}

/** Absolute (dev) or bunfs (binary) path to a grammar's wasm. */
export function grammarWasm(lang: Lang): string {
  return GRAMMARS[lang]
}

/** Absolute (dev) or bunfs (binary) path to the web-tree-sitter runtime wasm. */
export const runtimeWasm: string = runtimeWasmUrl
