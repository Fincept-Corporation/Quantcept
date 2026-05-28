import { createTextAttributes } from "@opentui/core"
import { useTheme } from "@tui/context/theme"
import { createSignal } from "solid-js"
import type { useDialog } from "./dialog"

const BOLD = createTextAttributes({ bold: true })

export function DialogConfirm(props: { title: string; message: string; onResult: (result: boolean) => void }) {
  const { theme } = useTheme()
  const [selected, setSelected] = createSignal(true)

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
