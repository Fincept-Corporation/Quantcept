/**
 * Collapse internal whitespace to single spaces, trim, and cap at `n` characters with a
 * trailing ellipsis when it overflows. The one display-truncation helper (job goals,
 * row labels) so the slice math isn't re-derived per call site.
 */
export function ellipsize(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim()
  return oneLine.length <= n ? oneLine : `${oneLine.slice(0, n - 1)}…`
}
