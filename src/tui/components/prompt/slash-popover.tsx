import type { Command } from "@ext/commands/types"
import { useTheme } from "@tui/context/theme"
import { For, Show } from "solid-js"

function oneLine(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export function SlashPopover(props: { results: Command[]; argItems?: string[]; selected: number }) {
  const { theme } = useTheme()
  const showArgs = () => (props.argItems?.length ?? 0) > 0
  const showCmds = () => !showArgs() && props.results.length > 0
  return (
    <Show when={showArgs() || showCmds()}>
      <box
        flexDirection="column"
        backgroundColor={theme.backgroundPanel}
        borderColor={theme.border}
        border={true}
        paddingLeft={1}
        paddingRight={1}
      >
        <Show when={showArgs()}>
          <For each={props.argItems}>
            {(arg, i) => (
              <text
                fg={i() === props.selected ? theme.accent : theme.text}
                bg={i() === props.selected ? theme.backgroundElement : undefined}
              >
                {(i() === props.selected ? "› " : "  ") + arg}
              </text>
            )}
          </For>
        </Show>
        <Show when={showCmds()}>
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
        </Show>
      </box>
    </Show>
  )
}
