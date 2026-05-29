import { type StyleDefinitionInput, SyntaxStyle } from "@opentui/core"
import type { ThemeColors } from "@tui/context/theme"

/**
 * Build an OpenTUI `SyntaxStyle` from the active theme so that markdown and
 * fenced code blocks in assistant messages use the theme's `markdown*` and
 * `syntax*` colors. Without this, `<markdown>` falls back to a default,
 * un-themed style and every theme renders chat code identically.
 *
 * Keys are tree-sitter highlight scopes. Markdown text blocks merge against
 * `markup.*` / `default` / `conceal`; fenced code blocks resolve the language
 * scopes (`keyword`, `string`, `function`, ...).
 */
export function buildSyntaxStyle(theme: ThemeColors): SyntaxStyle {
  const fg = (color: string, extra?: Omit<StyleDefinitionInput, "fg">): StyleDefinitionInput => ({
    fg: color,
    ...extra,
  })

  return SyntaxStyle.fromStyles({
    // Base / structural
    default: fg(theme.markdownText ?? theme.text),
    conceal: fg(theme.textMuted),

    // Markdown block scopes
    "markup.heading": fg(theme.markdownHeading, { bold: true }),
    "markup.strong": fg(theme.markdownStrong, { bold: true }),
    "markup.italic": fg(theme.markdownEmph, { italic: true }),
    "markup.link": fg(theme.markdownLink, { underline: true }),
    "markup.link.label": fg(theme.markdownLinkText),
    "markup.link.url": fg(theme.markdownLink, { underline: true }),
    "markup.quote": fg(theme.markdownBlockQuote, { italic: true }),
    "markup.raw": fg(theme.markdownCode),
    "markup.raw.block": fg(theme.markdownCode),
    "markup.list": fg(theme.markdownListItem),
    "markup.strikethrough": fg(theme.textMuted, { dim: true }),

    // Fenced code-block syntax scopes
    keyword: fg(theme.syntaxKeyword, { bold: true }),
    "keyword.function": fg(theme.syntaxKeyword, { bold: true }),
    "keyword.operator": fg(theme.syntaxOperator),
    function: fg(theme.syntaxFunction),
    "function.call": fg(theme.syntaxFunction),
    "function.method": fg(theme.syntaxFunction),
    variable: fg(theme.syntaxVariable),
    "variable.parameter": fg(theme.syntaxVariable),
    "variable.member": fg(theme.syntaxVariable),
    string: fg(theme.syntaxString),
    "string.special.url": fg(theme.markdownLink, { underline: true }),
    number: fg(theme.syntaxNumber),
    boolean: fg(theme.syntaxNumber),
    constant: fg(theme.syntaxNumber),
    "constant.builtin": fg(theme.syntaxNumber),
    type: fg(theme.syntaxType),
    "type.builtin": fg(theme.syntaxType),
    comment: fg(theme.syntaxComment, { italic: true, dim: true }),
    operator: fg(theme.syntaxOperator),
    punctuation: fg(theme.syntaxPunctuation),
    "punctuation.bracket": fg(theme.syntaxPunctuation),
    "punctuation.delimiter": fg(theme.syntaxPunctuation),
    property: fg(theme.syntaxVariable),
    tag: fg(theme.syntaxKeyword),
    attribute: fg(theme.syntaxFunction),
  })
}
