import { For, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import type { Command } from "@ext/commands/types"

function oneLine(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export function SlashPopover(props: { results: Command[]; selected: number }) {
  const { theme } = useTheme()
  return (
    <Show when={props.results.length > 0}>
      <box
        flexDirection="column"
        backgroundColor={theme.backgroundPanel}
        borderColor={theme.border}
        border={true}
        paddingLeft={1}
        paddingRight={1}
      >
        <For each={props.results}>
          {(cmd, i) => (
            <box flexDirection="row" backgroundColor={i() === props.selected ? theme.backgroundElement : undefined}>
              <box width={24} flexShrink={0}>
                <text fg={i() === props.selected ? theme.accent : theme.text}>{oneLine(`/${cmd.name}`, 24)}</text>
              </box>
              <box flexGrow={1} flexShrink={1}>
                <text fg={theme.textMuted}>{oneLine(cmd.description, 60)}</text>
              </box>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}
