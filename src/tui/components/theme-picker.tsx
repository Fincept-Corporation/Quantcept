import { createTextAttributes } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { createSignal, For } from "solid-js"

const BOLD = createTextAttributes({ bold: true })

export function ThemePicker(props: { names: string[]; onClose: () => void }) {
  const themeCtx = useTheme()
  const { theme } = themeCtx
  const renderer = useRenderer()
  const initial = Math.max(0, props.names.indexOf(themeCtx.selected))
  const [selected, setSelected] = createSignal(initial)

  useKeyboard((e: any) => {
    if (e.name === "escape") {
      e.preventDefault?.()
      themeCtx.set(props.names[initial]!) // revert to the originally-selected theme
      props.onClose()
    } else if (e.name === "up") {
      e.preventDefault?.()
      const next = Math.max(0, selected() - 1)
      setSelected(next)
      themeCtx.set(props.names[next]!) // live preview
    } else if (e.name === "down") {
      e.preventDefault?.()
      const next = Math.min(props.names.length - 1, selected() + 1)
      setSelected(next)
      themeCtx.set(props.names[next]!)
    } else if (e.name === "return" || e.name === "kpenter") {
      e.preventDefault?.()
      themeCtx.set(props.names[selected()]!)
      props.onClose()
    }
    renderer.requestRender()
  })

  return (
    <box flexDirection="column" gap={1}>
      <text fg={theme.accent} attributes={BOLD}>
        Select a theme
      </text>
      <box flexDirection="column">
        <For each={props.names}>
          {(name, i) => (
            <text
              fg={i() === selected() ? theme.accent : theme.text}
              bg={i() === selected() ? theme.backgroundElement : undefined}
            >
              {(i() === selected() ? "› " : "  ") + name}
            </text>
          )}
        </For>
      </box>
      <text fg={theme.textMuted}>↑/↓ preview · Enter select · Esc cancel</text>
    </box>
  )
}
