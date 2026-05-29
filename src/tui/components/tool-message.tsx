import { createTextAttributes } from "@opentui/core"
import { Show } from "solid-js"

const BOLD = createTextAttributes({ bold: true })

export function ToolMessage(props: {
  name: string
  status: "running" | "done"
  output?: unknown
  isError?: boolean
  theme: any
}) {
  const summary = () => {
    if (props.status === "running") return "running…"
    if (props.isError) return typeof props.output === "string" ? props.output : "error"
    return typeof props.output === "string" ? props.output : JSON.stringify(props.output)
  }
  const glyph = () => (props.status === "running" ? "⟳" : props.isError ? "✗" : "⊙")
  const color = () => (props.isError ? props.theme.error : props.theme.accent)
  return (
    <box marginTop={1} flexShrink={0} paddingLeft={2}>
      <box flexDirection="row">
        <text fg={color()} attributes={BOLD}>
          {glyph()} {props.name}
        </text>
        <Show when={props.status === "done"}>
          <text fg={props.theme.textMuted}> → {summary()}</text>
        </Show>
        <Show when={props.status === "running"}>
          <text fg={props.theme.textMuted}> {summary()}</text>
        </Show>
      </box>
    </box>
  )
}
