import { createTextAttributes } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { createSignal } from "solid-js"
import type { useDialog } from "./dialog"
import { dialogKeyAction } from "./dialog-keys"

const BOLD = createTextAttributes({ bold: true })

export function DialogConfirm(props: { title: string; message: string; onResult: (result: boolean) => void }) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const [selected, setSelected] = createSignal(true)

  // The prompt input is always focused, so without this the dialog never sees keys (it just
  // looked "stuck"). preventDefault stops the focused input from also acting on the key.
  useKeyboard((e: { name: string; preventDefault?: () => void }) => {
    const action = dialogKeyAction(e.name, selected())
    if (!action) return
    e.preventDefault?.()
    if ("toggle" in action) setSelected((s) => !s)
    else props.onResult(action.result)
    renderer.requestRender()
  })

  return (
    <box flexDirection="column" gap={1}>
      <text fg={theme.primary} attributes={BOLD}>
        {props.title}
      </text>
      <text fg={theme.text}>{props.message}</text>
      <box flexDirection="row" gap={2}>
        <text fg={selected() ? theme.background : theme.textMuted} bg={selected() ? theme.primary : undefined}>
          {" Yes "}
        </text>
        <text fg={!selected() ? theme.background : theme.textMuted} bg={!selected() ? theme.error : undefined}>
          {" No "}
        </text>
      </box>
      <text fg={theme.textMuted}>Use arrow keys to switch, Enter to confirm</text>
    </box>
  )
}

DialogConfirm.show = (dialog: ReturnType<typeof useDialog>, title: string, message: string) => {
  return new Promise<boolean>((resolve) => {
    dialog.replace(() => (
      <DialogConfirm
        title={title}
        message={message}
        onResult={(result) => {
          dialog.clear()
          resolve(result)
        }}
      />
    ))
  })
}
