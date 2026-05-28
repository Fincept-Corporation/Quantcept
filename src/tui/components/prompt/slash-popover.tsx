import { For, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import type { Command } from "@ext/commands/types"

export function SlashPopover(props: { results: Command[]; selected: number }) {
  const { theme } = useTheme()
  return (
    <Show when={props.results.length > 0}>
      <box flexDirection="column" backgroundColor={theme.backgroundPanel}
        borderColor={theme.border} border={true} paddingLeft={1} paddingRight={1} maxHeight={8}>
        <For each={props.results}>
          {(cmd, i) => (
            <box flexDirection="row" gap={1}
              backgroundColor={i() === props.selected ? theme.backgroundElement : undefined}>
              <text fg={i() === props.selected ? theme.accent : theme.text}>/{cmd.name}</text>
              <text fg={theme.textMuted}>{cmd.description}</text>
              <Show when={cmd.argumentHint}><text fg={theme.textMuted}>{cmd.argumentHint}</text></Show>
            </box>
          )}
        </For>
      </box>
    </Show>
  )
}
