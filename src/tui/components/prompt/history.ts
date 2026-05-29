// Pure command-history navigation for the prompt's ↑/↓ keys.
//
// `index === null` means "not navigating" — the input shows the user's live
// draft. The first ↑ jumps to the newest entry; further ↑ walk backward; ↓
// walks forward and, past the newest entry, returns to the live draft.
//
// `value === null` in a result means "no change — caller should do nothing".

export interface HistoryState {
  index: number | null
}

export interface HistoryResult {
  value: string | null
  state: HistoryState
}

/** ↑ — recall an older entry (or the newest, from the live draft). */
export function historyPrev(history: readonly string[], state: HistoryState): HistoryResult {
  if (history.length === 0) return { value: null, state: { index: null } }
  const next = state.index === null ? history.length - 1 : Math.max(0, state.index - 1)
  return { value: history[next]!, state: { index: next } }
}

/** ↓ — move to a newer entry, or back to the live draft past the newest. */
export function historyNext(history: readonly string[], state: HistoryState): HistoryResult {
  if (state.index === null) return { value: null, state: { index: null } }
  const next = state.index + 1
  if (next >= history.length) return { value: "", state: { index: null } }
  return { value: history[next]!, state: { index: next } }
}
