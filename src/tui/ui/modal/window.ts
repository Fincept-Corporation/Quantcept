/** A visible slice [offset, end) plus the in-window index of the cursor. */
export interface WindowSlice {
  offset: number
  end: number
  selected: number
}

/** Window `size` items around `cursor` within a list of `len`, clamped to the ends. */
export function computeWindow(len: number, cursor: number, size: number): WindowSlice {
  if (len <= size) return { offset: 0, end: len, selected: cursor }
  const offset = Math.min(Math.max(0, cursor - Math.floor(size / 2)), len - size)
  return { offset, end: offset + size, selected: cursor - offset }
}

/** Move `cursor` by `dir` (+1/-1), clamped to [0, len-1] (or 0 when empty). */
export function nextIndex(len: number, cursor: number, dir: number): number {
  if (len <= 0) return 0
  return Math.min(Math.max(0, cursor + dir), len - 1)
}
