import { useRenderer } from "@opentui/solid"
import { pasteText } from "@tui/platform/paste"
import { type Accessor, createSignal } from "solid-js"
import { type FormState, formReducer, initForm } from "./formReducer"
import type { NavKey } from "./useListNav"

export type FormField = string | { label: string; secret?: boolean }

export interface FormSpec {
  title?: string
  fields: FormField[]
  onComplete: (values: string[]) => void | Promise<void>
}

export interface ModalForm {
  active: Accessor<boolean>
  spec: Accessor<FormSpec | null>
  state: Accessor<FormState>
  start: (spec: FormSpec, prefill?: string) => void
  cancel: () => void
  handleKey: (e: NavKey) => boolean
  handlePaste: (e: { bytes: Uint8Array | string }) => void
}

const labelOf = (f: FormField) => (typeof f === "string" ? f : f.label)

/**
 * Multi-step text-entry for a modal: owns the buffer/step state and centralizes
 * paste (the one place paste is handled for every modal). Exposes handleKey /
 * handlePaste rather than subscribing, so useModalKeyboard keeps a single
 * subscription with deterministic precedence.
 */
export function useModalForm(opts: { onError?: (e: unknown) => void } = {}): ModalForm {
  const renderer = useRenderer()
  const [spec, setSpec] = createSignal<FormSpec | null>(null)
  const [state, setState] = createSignal<FormState>(initForm([]))
  const render = () => renderer.requestRender()

  const start = (s: FormSpec, prefill = "") => {
    setSpec(s)
    setState(initForm(s.fields.map(labelOf), prefill))
    render()
  }
  const cancel = () => {
    setSpec(null)
    render()
  }
  const complete = (values: string[]) => {
    const s = spec()
    setSpec(null)
    render()
    if (s) void Promise.resolve(s.onComplete(values)).catch((e) => opts.onError?.(e))
  }

  const handleKey = (e: NavKey): boolean => {
    if (!spec()) return false
    if (e.name === "escape") {
      e.preventDefault?.()
      cancel()
      return true
    }
    if (e.name === "return" || e.name === "kpenter") {
      e.preventDefault?.()
      const next = formReducer(state(), { type: "submit" })
      if (next.done) complete(next.done)
      else {
        setState(next)
        render()
      }
      return true
    }
    if (e.name === "backspace") {
      e.preventDefault?.()
      setState(formReducer(state(), { type: "backspace" }))
      render()
      return true
    }
    if (typeof e.sequence === "string" && e.sequence.length === 1 && !e.ctrl && !e.meta) {
      e.preventDefault?.()
      setState(formReducer(state(), { type: "char", ch: e.sequence }))
      render()
      return true
    }
    return true // form is modal: swallow other keys while active
  }

  const handlePaste = (e: { bytes: Uint8Array | string }) => {
    if (!spec()) return
    const text = pasteText(e.bytes)
    if (!text) return
    setState(formReducer(state(), { type: "paste", text }))
    render()
  }

  return { active: () => spec() !== null, spec, state, start, cancel, handleKey, handlePaste }
}
