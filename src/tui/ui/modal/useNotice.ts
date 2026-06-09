import { useRenderer } from "@opentui/solid"
import { type Accessor, createSignal } from "solid-js"

export interface Notice {
  notice: Accessor<string | undefined>
  err: Accessor<string | undefined>
  busy: Accessor<string | undefined>
  flash: (m: string) => void
  fail: (e: unknown) => void
  setBusy: (tag?: string) => void
  clear: () => void
}

/**
 * Shared notice / error / busy state for modals. `mapError` lets a modal translate
 * domain errors (e.g. insufficient credits) into a message before display.
 */
export function useNotice(opts: { mapError?: (e: unknown) => string } = {}): Notice {
  const renderer = useRenderer()
  const [notice, setNotice] = createSignal<string | undefined>()
  const [err, setErr] = createSignal<string | undefined>()
  const [busy, setBusyState] = createSignal<string | undefined>()
  const render = () => renderer.requestRender()
  const toMessage = (e: unknown) => opts.mapError?.(e) ?? (e instanceof Error ? e.message : String(e))
  return {
    notice,
    err,
    busy,
    flash: (m) => {
      setNotice(m)
      setErr(undefined)
      render()
    },
    fail: (e) => {
      setErr(toMessage(e))
      setNotice(undefined)
      render()
    },
    setBusy: (tag) => {
      setBusyState(tag)
      render()
    },
    clear: () => {
      setNotice(undefined)
      setErr(undefined)
      render()
    },
  }
}
