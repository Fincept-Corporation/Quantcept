import { renderDiagram } from "@core/diagram/render"
import type { ThemeColors } from "@tui/context/theme"
import { createMemo, For, Show } from "solid-js"

/**
 * Renders one inline `qdiagram` block.
 *
 * While the fence is still streaming (`closed: false`) we show a placeholder and
 * defer rendering — the DSL body is incomplete and would draw garbage. Once
 * closed we render the headless engine's text artifact line-by-line (each line in
 * a fixed height-1 box, mirroring the logo, so a wide diagram clips instead of
 * reflowing and breaking alignment). Phase 3 swaps these `<text>` lines for
 * native bordered boxes; the engine output stays the source of truth for /copy.
 */
export function DiagramBlock(props: { body: string; closed: boolean; theme: ThemeColors }) {
  const artifact = createMemo(() => (props.closed ? renderDiagram(props.body) : null))
  const lines = createMemo(() => artifact()?.text.split("\n") ?? [])
  const fg = () => (artifact()?.isError ? props.theme.error : props.theme.markdownText)

  return (
    <box flexDirection="column" marginTop={1} marginBottom={1} paddingLeft={2} flexShrink={0}>
      <Show when={props.closed} fallback={<text fg={props.theme.textMuted}>▢ drawing diagram…</text>}>
        <For each={lines()}>
          {(line) => (
            <box height={1}>
              <text fg={fg()}>{line}</text>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}
