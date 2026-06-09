import { useRenderer } from "@opentui/solid"
import { type Accessor, createMemo, createSignal } from "solid-js"
import { computeWindow, nextIndex } from "./window"

/** Minimal shape of an OpenTUI key event we rely on (it is otherwise untyped). */
export interface NavKey {
  name?: string
  sequence?: string
  ctrl?: boolean
  meta?: boolean
  preventDefault?: () => void
}

export interface ListNav<T> {
  cursor: Accessor<number>
  setCursor: (n: number) => void
  /** Memoized window: the visible slice + its offset + the in-window selected index. */
  window: Accessor<{ slice: T[]; offset: number; selected: number }>
  /** Handle a key; returns true if consumed. Does NOT subscribe — the modal's
   *  useModalKeyboard calls this so there is a single keyboard subscription. */
  handleKey: (e: NavKey) => boolean
}

export function useListNav<T>(opts: {
  items: Accessor<T[]>
  windowSize?: number
  onSelect?: (item: T, index: number) => void
  onKey?: (e: NavKey, item: T | undefined, index: number) => boolean
  onEscape?: () => void
}): ListNav<T> {
  const renderer = useRenderer()
  const size = opts.windowSize ?? 14
  const [cursor, setCursorRaw] = createSignal(0)
  const setCursor = (n: number) => {
    setCursorRaw(n)
    renderer.requestRender()
  }

  const window = createMemo(() => {
    const items = opts.items()
    const clamped = Math.min(cursor(), Math.max(0, items.length - 1))
    const w = computeWindow(items.length, clamped, size)
    return { slice: items.slice(w.offset, w.end), offset: w.offset, selected: w.selected }
  })

  const handleKey = (e: NavKey): boolean => {
    const items = opts.items()
    const i = cursor()
    const item = items[i]
    // Modal-specific keys first (custom letters, ←/→ cycling, etc.).
    if (opts.onKey?.(e, item, i)) {
      e.preventDefault?.()
      return true
    }
    if (e.name === "escape") {
      e.preventDefault?.()
      opts.onEscape?.()
      return true
    }
    if (e.name === "up") {
      e.preventDefault?.()
      setCursor(nextIndex(items.length, i, -1))
      return true
    }
    if (e.name === "down") {
      e.preventDefault?.()
      setCursor(nextIndex(items.length, i, 1))
      return true
    }
    if (e.name === "return" || e.name === "kpenter") {
      e.preventDefault?.()
      if (item !== undefined) opts.onSelect?.(item, i)
      return true
    }
    return false
  }

  return { cursor, setCursor, window, handleKey }
}
