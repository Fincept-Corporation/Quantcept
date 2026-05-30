import { marked, type Token, type Tokens } from "marked"

/**
 * Convert markdown to clean, readable plain text for clipboard copy: drops
 * `#`/`**`/`*`/`` ` ``/`~~` markers, flattens links to "text (url)", renders
 * lists with bullets, and aligns tables into space-separated columns. Used by the
 * Ctrl+Y copy action so pasted output is plain prose, not markdown source.
 */
export function markdownToPlainText(md: string): string {
  if (!md?.trim()) return md
  const out = renderBlocks(marked.lexer(md))
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function renderBlocks(tokens: Token[]): string {
  let out = ""
  for (const t of tokens) out += renderBlock(t)
  return out
}

function renderBlock(t: Token): string {
  switch (t.type) {
    case "heading":
      return `${renderInline((t as Tokens.Heading).tokens)}\n\n`
    case "paragraph":
      return `${renderInline((t as Tokens.Paragraph).tokens)}\n\n`
    case "text": {
      const tt = t as Tokens.Text
      return `${tt.tokens ? renderInline(tt.tokens) : tt.text}\n`
    }
    case "list":
      return `${renderList(t as Tokens.List)}\n\n`
    case "table":
      return `${renderTable(t as Tokens.Table)}\n\n`
    case "code":
      return `${(t as Tokens.Code).text}\n\n`
    case "blockquote":
      return `${renderBlocks((t as Tokens.Blockquote).tokens).trim()}\n\n`
    case "hr":
      return "\n"
    case "space":
      return ""
    default:
      return hasText(t) ? `${t.text}\n` : ""
  }
}

function renderInline(tokens?: Token[]): string {
  if (!tokens) return ""
  let out = ""
  for (const t of tokens) {
    switch (t.type) {
      case "text": {
        const tt = t as Tokens.Text
        out += tt.tokens ? renderInline(tt.tokens) : tt.text
        break
      }
      case "strong":
        out += renderInline((t as Tokens.Strong).tokens)
        break
      case "em":
        out += renderInline((t as Tokens.Em).tokens)
        break
      case "del":
        out += renderInline((t as Tokens.Del).tokens)
        break
      case "codespan":
        out += (t as Tokens.Codespan).text
        break
      case "link": {
        const lt = t as Tokens.Link
        const txt = renderInline(lt.tokens)
        out += lt.href && lt.href !== txt ? `${txt} (${lt.href})` : txt
        break
      }
      case "image":
        out += (t as Tokens.Image).text
        break
      case "br":
        out += "\n"
        break
      case "escape":
        out += (t as Tokens.Escape).text
        break
      default:
        if (hasText(t)) out += t.text
    }
  }
  return out
}

function renderList(list: Tokens.List): string {
  const start = typeof list.start === "number" ? list.start : 1
  return list.items
    .map((item, i) => {
      const marker = list.ordered ? `${start + i}. ` : "• "
      const body = renderBlocks(item.tokens).trim()
      return marker + body.replace(/\n/g, `\n${" ".repeat(marker.length)}`)
    })
    .join("\n")
}

function renderTable(table: Tokens.Table): string {
  const header = table.header.map((c) => renderInline(c.tokens).trim())
  const rows = table.rows.map((row) => row.map((c) => renderInline(c.tokens).trim()))
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)))
  const fmt = (cells: string[]) =>
    cells
      .map((c, i) => (c ?? "").padEnd(widths[i] ?? 0))
      .join("  ")
      .trimEnd()
  return [fmt(header), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(fmt)].join("\n")
}

function hasText(t: Token): t is Token & { text: string } {
  return "text" in t && typeof (t as { text?: unknown }).text === "string"
}
