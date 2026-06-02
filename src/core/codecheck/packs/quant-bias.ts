import { queryMatches } from "@core/treesitter/engine"
import type { Diagnostic, RulePack } from "../types"

const LOOKAHEAD_SHIFT = `(call
  function: (attribute attribute: (identifier) @m (#eq? @m "shift"))
  arguments: (argument_list (unary_operator "-" (integer)))) @hit`

// Two patterns: the slice form (df.iloc[i+1:]) wraps the binary_operator in a (slice ...) node.
const FUTURE_INDEX = `[
  (subscript subscript: (binary_operator operator: "+" right: (integer))) @hit
  (subscript subscript: (slice (binary_operator operator: "+" right: (integer)))) @hit
]`

// fit-before-split needs cross-node order reasoning — handled in refine().
const FIT_CALL = `(call
  function: (attribute attribute: (identifier) @m (#eq? @m "fit"))
  arguments: (argument_list (identifier) @arg)) @fit`
const SPLIT_CALL = `(call
  function: (identifier) @fn (#eq? @fn "train_test_split")
  arguments: (argument_list (identifier) @arg)) @split`

export const quantBiasPack: RulePack = {
  id: "quant-bias",
  lang: "python",
  rules: [
    {
      ruleId: "bias/lookahead-shift",
      scm: LOOKAHEAD_SHIFT,
      severity: "error",
      message: "Negative shift peeks the future — .shift(-n) builds a label/feature from future bars.",
      fixHint: "Use .shift(n) with n>0 to look back, or build the label then drop the last n rows.",
    },
    {
      ruleId: "bias/future-index",
      scm: FUTURE_INDEX,
      severity: "error",
      message: "Forward indexing (i+1) reads a future observation at time i.",
      fixHint: "Index backward (i-1), or use a rolling/expanding window aligned to the present.",
    },
  ],
  refine(diags, tree) {
    // Flag a .fit(X) whose argument is later passed to train_test_split(X) (fit on full data
    // before the split leaks test statistics into training). Verified pairing — spec §6.2.
    // biome-ignore lint/suspicious/noExplicitAny: opaque tree from the engine
    const fits = queryMatches(tree as any, FIT_CALL, "python")
    // biome-ignore lint/suspicious/noExplicitAny: opaque tree from the engine
    const splits = queryMatches(tree as any, SPLIT_CALL, "python")
    if (!fits.length || !splits.length) return diags

    const splitArgs = splits
      .map((m) => {
        const arg = m.captures.find((c) => c.name === "arg")
        const node = m.captures.find((c) => c.name === "split")
        return arg && node ? { name: arg.span.text, at: node.span.byteStart } : null
      })
      .filter((x): x is { name: string; at: number } => x !== null)

    const extra: Diagnostic[] = []
    for (const m of fits) {
      const fitCap = m.captures.find((c) => c.name === "fit")
      const argCap = m.captures.find((c) => c.name === "arg")
      if (!fitCap || !argCap) continue
      const leaks = splitArgs.some((s) => s.name === argCap.span.text && s.at > fitCap.span.byteStart)
      if (leaks) {
        extra.push({
          ruleId: "bias/fit-before-split",
          severity: "warn",
          span: fitCap.span,
          message: "Scaler/model fit on the full dataset before train_test_split leaks test statistics.",
          fixHint: "Split first, then fit only on the training fold (e.g. inside a Pipeline).",
        })
      }
    }
    return diags.concat(extra)
  },
}
