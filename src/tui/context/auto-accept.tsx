import { createSignal } from "solid-js"
import { createSimpleContext } from "./helper"

/**
 * Auto-accept ("shift+tab") toggle state, shared across the home screen and every session so the
 * mode and its indicator stay consistent as you navigate — and a fresh session inherits whatever
 * was set on home. Pure state container; the toast feedback lives where it's toggled (App), since
 * both the /auto command and the shift+tab keybind are wired there.
 */
export const { use: useAutoAccept, provider: AutoAcceptProvider } = createSimpleContext({
  name: "AutoAccept",
  init: () => {
    const [enabled, setEnabled] = createSignal(false)
    return {
      /** Reactive accessor — true when auto-accept is ON. */
      enabled,
      set: (next: boolean) => setEnabled(next),
      toggle: () => setEnabled((v) => !v),
    }
  },
})

export type AutoAcceptContext = ReturnType<typeof useAutoAccept>
