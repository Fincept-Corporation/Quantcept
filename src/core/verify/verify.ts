import { parse, query } from "@core/treesitter/engine"
import type { Lang } from "@core/treesitter/types"
import type { Diagnostic, RulePack } from "./types"

/**
 * Parse `text` once, run every applicable pack's rules, map each `@hit` capture to a
 * Diagnostic, apply each pack's optional refine() pass, and return a flat, span-sorted list.
 * Engine-unavailable (null parse) yields [] — verification is never fatal.
 */
export async function verify(text: string, lang: Lang, packs: RulePack[]): Promise<Diagnostic[]> {
  const tree = await parse(text, lang)
  if (!tree) return []

  const out: Diagnostic[] = []
  for (const pack of packs) {
    if (pack.lang !== lang) continue
    let diags: Diagnostic[] = []
    for (const rule of pack.rules) {
      for (const cap of query(tree, rule.scm, lang)) {
        if (cap.name !== "hit") continue
        diags.push({
          ruleId: rule.ruleId,
          severity: rule.severity,
          span: cap.span,
          message: rule.message,
          fixHint: rule.fixHint,
          docUrl: rule.docUrl,
        })
      }
    }
    if (pack.refine) diags = pack.refine(diags, tree)
    out.push(...diags)
  }

  out.sort((a, b) => a.span.byteStart - b.span.byteStart)
  return out
}
