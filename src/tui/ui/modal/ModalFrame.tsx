import { useTheme } from "@tui/context/theme"
import { type JSX, Show } from "solid-js"

/** Shared modal chrome: title · body · busy/notice/error · footer. */
export function ModalFrame(props: {
  title: string
  footer?: string
  notice?: string
  error?: string
  busy?: string
  minWidth?: number
  children: JSX.Element
}) {
  const { theme } = useTheme()
  return (
    <box flexDirection="column" minWidth={props.minWidth ?? 62} gap={0}>
      <text fg={theme.accent}>{props.title}</text>
      <box height={1} minHeight={0} />
      {props.children}
      <box height={1} minHeight={0} />
      <Show when={props.busy}>
        <text fg={theme.textMuted}>Working… ({props.busy})</text>
      </Show>
      <Show when={props.notice}>
        <text fg={theme.accent}>{props.notice}</text>
      </Show>
      <Show when={props.error}>
        <text fg="#ff5555">{props.error}</text>
      </Show>
      <Show when={props.footer}>
        <text fg={theme.textMuted}>{props.footer}</text>
      </Show>
    </box>
  )
}
