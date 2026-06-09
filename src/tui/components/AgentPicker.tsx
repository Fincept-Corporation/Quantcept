import type { LoadedAgent } from "@core/agent/agent-manifest"
import { createTextAttributes } from "@opentui/core"
import { displayModel } from "@shared/branding"
import { useTheme } from "@tui/context/theme"
import { ModalList, type NavKey, useListNav, useModalKeyboard } from "@tui/ui/modal"
import { createMemo } from "solid-js"

const BOLD = createTextAttributes({ bold: true })

type Item = { name: string | undefined; label: string; desc: string }

/**
 * Agent selection modal. Rendered inside the dialog overlay (ABOVE the providers), so it
 * takes the agent list from the route as a reactive accessor prop rather than calling
 * `useAgents()` itself. Built on the shared modal layer (`useListNav` + `useModalKeyboard`),
 * with a render-prop `ModalList` for the 2-line rows. Selecting row 0 picks the default
 * assistant (onSelect(undefined)); Tab also advances the cursor (legacy behavior).
 */
export function AgentPicker(props: {
  agents: () => LoadedAgent[]
  current?: string
  onSelect: (name?: string) => void
  onClose: () => void
}) {
  const { theme } = useTheme()

  const items = createMemo<Item[]>(() => [
    { name: undefined, label: "Default assistant", desc: "Full Quantcept assistant — all tools, memory, skills" },
    ...props.agents().map((a) => ({
      name: a.name,
      label: a.name,
      desc: a.model ? `${a.description}  ·  ${displayModel(a.model)}` : a.description,
    })),
  ])

  const nav = useListNav<Item>({
    items,
    onSelect: (it) => {
      props.onSelect(it.name)
      props.onClose()
    },
    onEscape: props.onClose,
    onKey: (e: NavKey, _item, i) => {
      if (e.name === "tab") {
        nav.setCursor(Math.min(items().length - 1, i + 1))
        return true
      }
      return false
    },
  })
  useModalKeyboard({ nav })

  // Seed the cursor on the currently-active agent (default assistant = row 0). The window
  // memo clamps it if the list later shrinks, so no separate clamp effect is needed.
  nav.setCursor(
    Math.max(
      0,
      items().findIndex((i) => i.name === props.current),
    ),
  )

  return (
    <box flexDirection="column" gap={1} minWidth={48}>
      <text fg={theme.accent} attributes={BOLD}>
        Select an agent
      </text>
      <ModalList window={nav.window()}>
        {(it, selected) => (
          <box flexDirection="column" backgroundColor={selected ? theme.backgroundElement : undefined}>
            <text fg={selected ? theme.accent : theme.text}>{(selected ? "› " : "  ") + it.label}</text>
            <text fg={theme.textMuted}>{`    ${it.desc}`}</text>
          </box>
        )}
      </ModalList>
      <text fg={theme.textMuted}>↑/↓ move · Enter select · Esc cancel</text>
    </box>
  )
}
