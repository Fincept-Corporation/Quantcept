import { createTextAttributes } from "@opentui/core"
import { useTheme } from "@tui/context/theme"
import type { JSX } from "solid-js"
import { useDialog } from "./dialog"

const BOLD = createTextAttributes({ bold: true })

export function DialogAlert(props: { title: string; message: string }) {
  const { theme } = useTheme()
  const dialog = useDialog()

  return (
    <box flexDirection="column" gap={1}>
      <text fg={theme.primary} attributes={BOLD}>
        {props.title}
      </text>
      <text fg={theme.text}>{props.message}</text>
      <text fg={theme.textMuted}>Press any key to dismiss</text>
    </box>
  )
}

DialogAlert.show = (dialog: ReturnType<typeof useDialog>, title: string, message: string) => {
  return new Promise<void>((resolve) => {
    dialog.replace(() => {
      setTimeout(() => {
        dialog.clear()
        resolve()
      }, 5000)
      return <DialogAlert title={title} message={message} />
    })
  })
}
