/** Pure picker filter: drop the current session, then title-substring match (case-insensitive). */
export function filterSessions<T extends { id: string; title: string | null }>(
  items: T[],
  query: string,
  currentId?: string,
): T[] {
  const q = query.trim().toLowerCase()
  return items.filter((s) => s.id !== currentId).filter((s) => q === "" || (s.title ?? "").toLowerCase().includes(q))
}
