/**
 * Parse the YAML-ish frontmatter shared by every manifest loader (skills, agents, slash
 * commands, plugin commands). ONE parser so the CRLF / inline-array / block-list /
 * folded-scalar / quoted-value edge cases live — and get fixed — in a single place
 * instead of being re-derived (subtly differently) per subsystem.
 *
 * Supported inside the fenced `---` block:
 *   key: value                   → string (one layer of surrounding quotes stripped)
 *   key: [a, b, c]               → string[] (items unquoted, empties dropped)
 *   key:\n  - a\n  - b           → string[] (YAML block list)
 *   key:\n  line one\n  line two → "line one line two" (folded scalar)
 * Indented lines under a key (a nested mapping) fold into that key's scalar and do NOT
 * leak as top-level keys.
 *
 * A bare `key:` keeps an empty-string value; callers that want it to read as *absent*
 * (e.g. an agent inheriting the configured model) drop empty values themselves. The body
 * is returned verbatim — NOT trimmed; callers trim as needed.
 */
export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const content = raw.replace(/\r\n/g, "\n")
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content)
  if (!match) return { data: {}, body: content }

  const data: Record<string, unknown> = {}
  const lines = match[1]!.split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    i++
    if (/^\s/.test(line) || line.trim() === "") continue // indented (nested) or blank → not a top-level key
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()

    // Inline array: `key: [a, b, c]`.
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = splitItems(value.slice(1, -1))
      continue
    }

    // Empty value → a YAML block list (`- item` lines) or a folded scalar (indented lines).
    if (value === "") {
      const listItems: string[] = []
      const scalarParts: string[] = []
      while (i < lines.length && (/^\s/.test(lines[i]!) || lines[i]!.trim() === "")) {
        const cont = lines[i]!.trim()
        if (cont !== "") {
          if (cont.startsWith("- ")) listItems.push(unquote(cont.slice(2).trim()))
          else scalarParts.push(cont)
        }
        i++
      }
      if (listItems.length > 0) {
        data[key] = listItems
        continue
      }
      value = scalarParts.join(" ")
    }

    data[key] = unquote(value)
  }
  return { data, body: match[2] ?? "" }
}

/** Strip one layer of surrounding single/double quotes (matches the legacy per-subsystem parsers). */
function unquote(s: string): string {
  return s.replace(/^["']|["']$/g, "")
}

/** Split a comma-separated inline-array body into trimmed, unquoted, non-empty items. */
function splitItems(inner: string): string[] {
  return inner
    .split(",")
    .map((s) => unquote(s.trim()))
    .filter((s) => s.length > 0)
}
