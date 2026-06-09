import { createTextAttributes } from "@opentui/core"
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
    if (props.status === "running") return "running…"
    if (!props.isError && props.title) return props.title
    return summarizeToolOutput(props.output, props.isError)
  }
  // Grey while the tool is in use, green once it finishes (red on error). The square marker and
  // the left rule share this color, so each tool reads as a small rectangular node — not a circle.
  const statusColor = () =>
    props.isError ? props.theme.error : props.status === "running" ? props.theme.textMuted : props.theme.success
  // Filled squares (rectangular), not the old ⊙ circle: hollow-ish small square while running,
  // solid square when done.
  const marker = () => (props.status === "running" ? "▪" : "■")
  return (
    <box marginTop={1} flexShrink={0} paddingLeft={2}>
      <box flexShrink={0} border={["left"]} borderColor={statusColor()} paddingLeft={1}>
        <text fg={statusColor()} attributes={BOLD}>
          {marker()} {props.name}
        </text>
        {/* Result branches off the node with a tree connector. */}
        <text fg={props.theme.textMuted}>└─ {summary()}</text>
      </box>
    </box>
  )
}
