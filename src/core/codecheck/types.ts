import type { Lang, Span } from "@core/treesitter/types"

export type Severity = "error" | "warn" | "info"

/** One declarative rule: an .scm query whose `@hit` captures become diagnostics. */
export interface ScmRule {
  ruleId: string
  scm: string
  severity: Severity
  message: string
  fixHint?: string
  docUrl?: string
}

/** A structured finding bound to an exact source span. Pure data — no UI. */
export interface Diagnostic {
  ruleId: string
  severity: Severity
  span: Span
  message: string
  fixHint?: string
  docUrl?: string
}

/** A composable set of rules for one language, plus an optional cross-node post-pass. */
export interface RulePack {
  id: string
  lang: Lang
  rules: ScmRule[]
  /** Optional refinement for rules that need order/cross-node reasoning a single query can't do. */
  // biome-ignore lint/suspicious/noExplicitAny: tree is the opaque web-tree-sitter tree
  refine?(diags: Diagnostic[], tree: any): Diagnostic[]
}
