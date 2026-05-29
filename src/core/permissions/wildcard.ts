/** Glob match: "*" matches any run of chars (including "/"); other chars are literal. */
export function wildcardMatch(value: string, pattern: string): boolean {
  if (pattern === "*") return true
  const re = new RegExp(
    "^" +
      pattern
        .split("*")
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$",
  )
  return re.test(value)
}
