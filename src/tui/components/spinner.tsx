import { useTheme } from "@tui/context/theme"
import { createSignal, onCleanup } from "solid-js"

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Spinner(props: { label?: string }) {
  const { theme } = useTheme()
  const [frame, setFrame] = createSignal(0)

  const interval = setInterval(() => {
    setFrame((f) => (f + 1) % FRAMES.length)
  }, 80)

  onCleanup(() => clearInterval(interval))

  return (
    <box flexDirection="row" gap={1}>
      <text fg={theme.accent}>{FRAMES[frame()]}</text>
      {props.label && <text fg={theme.textMuted}>{props.label}</text>}
    </box>
  )
}
