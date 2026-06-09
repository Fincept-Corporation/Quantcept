import { useKeyboard, usePaste } from "@opentui/solid"
import type { NavKey } from "./useListNav"
import type { ModalForm } from "./useModalForm"

/**
 * The ONLY keyboard + paste subscription a modal needs. Precedence per event:
 * active form → modal custom keys (onKey) → list nav. Paste goes to the form when
 * active, else to onPaste (e.g. a palette filter). A single subscription avoids the
 * double-fire that independent gated subscriptions hit when a key flips state
 * mid-event.
 */
export function useModalKeyboard(routes: {
  form?: Pick<ModalForm, "active" | "handleKey" | "handlePaste">
  nav?: { handleKey: (e: NavKey) => boolean }
  onKey?: (e: NavKey) => boolean
  onPaste?: (e: { bytes: Uint8Array | string }) => void
}): void {
  // biome-ignore lint/suspicious/noExplicitAny: @opentui keyboard event is untyped
  useKeyboard((e: any) => {
    if (routes.form?.active()) {
      routes.form.handleKey(e)
      return
    }
    if (routes.onKey?.(e)) return
    routes.nav?.handleKey(e)
  })
  // biome-ignore lint/suspicious/noExplicitAny: @opentui paste event is untyped
  usePaste((e: any) => {
    if (routes.form?.active()) {
      routes.form.handlePaste(e)
      return
    }
    routes.onPaste?.(e)
  })
}
