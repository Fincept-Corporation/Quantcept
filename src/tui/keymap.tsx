import type { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import {
  KeymapProvider as OpenTuiKeymapProvider,
  useKeymap,
  useBindings as useOpenTuiBindings,
} from "@opentui/keymap/solid"
import { createContext, type ParentProps, useContext } from "solid-js"

export const QUANTCEPT_BASE_MODE = "quantcept"
export const COMMAND_PALETTE_COMMAND = "command.palette.show"

const QuantceptKeymapCtx = createContext<ReturnType<typeof createDefaultOpenTuiKeymap>>()

export function useQuantceptKeymap() {
  const km = useContext(QuantceptKeymapCtx)
  if (!km) throw new Error("QuantceptKeymapProvider required")
  return km
}

export function QuantceptKeymapProvider(props: ParentProps<{ keymap: ReturnType<typeof createDefaultOpenTuiKeymap> }>) {
  return (
    <OpenTuiKeymapProvider keymap={props.keymap}>
      <QuantceptKeymapCtx.Provider value={props.keymap}>{props.children}</QuantceptKeymapCtx.Provider>
    </OpenTuiKeymapProvider>
  )
}

export { useBindings } from "@opentui/keymap/solid"
