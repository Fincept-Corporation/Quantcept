import type { LoadedSkill } from "@core/skills"
import { useTheme } from "@tui/context/theme"
import { ModalFrame, ModalList, useListNav, useModalKeyboard } from "@tui/ui/modal"
import { Show } from "solid-js"

function oneLine(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * /skills browser: lists every discovered skill (bundled + user/project + plugin)
 * and runs the highlighted one via the host's runSkill hook. Built on the shared
 * modal layer; multi-line rows use ModalList's render-prop.
 */
export function SkillsModal(props: {
  skills: () => LoadedSkill[]
  onRun: (name: string) => void
  onClose: () => void
}) {
  const { theme } = useTheme()
  const nav = useListNav<LoadedSkill>({
    items: () => props.skills(),
    onSelect: (skill) => {
      props.onClose()
      props.onRun(skill.name)
    },
    onEscape: props.onClose,
  })
  useModalKeyboard({ nav })

  return (
    <ModalFrame title="🧩 Skills" footer="↑/↓ · Enter run · Esc close">
      <Show
        when={props.skills().length > 0}
        fallback={<text fg={theme.textMuted}>No skills found. Add a SKILL.md under .quantcept/skills.</text>}
      >
        <ModalList window={nav.window()}>
          {(skill, selected) => (
            <box flexDirection="row" gap={2} backgroundColor={selected ? theme.backgroundElement : undefined}>
              <box width={22} flexShrink={0}>
                <text fg={selected ? theme.accent : theme.text}>{(selected ? "› " : "  ") + skill.name}</text>
              </box>
              <box flexGrow={1} flexShrink={1}>
                <text fg={theme.textMuted}>{oneLine(skill.description ?? "", 60)}</text>
              </box>
            </box>
          )}
        </ModalList>
      </Show>
    </ModalFrame>
  )
}
