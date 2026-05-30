import { createTextAttributes } from "@opentui/core"
import { Show } from "solid-js"
import { summarizeToolOutput } from "./tool-summary"

const BOLD = createTextAttributes({ bold: true })

export function ToolMessage(props: {
  name: string
  status: "running" | "done"
  output?: unknown
  title?: string
  isError?: boolean
  theme: any
}) {
  // Show a short label, not the raw payload: the tool's own `title` when set,
  // otherwise a condensed one-line summary of the output.
  const summary = () => {
    if (props.status === "running") return "fetching…"
    if (!props.isError && props.title) return props.title
    return summarizeToolOutput(props.output, props.isError)
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
