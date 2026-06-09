import { useTheme } from "@tui/context/theme"
import { For, type JSX, Show } from "solid-js"

/** Windowed row renderer. Use the label/right props for the common case, override
 *  `marker`/`fg` for per-row styling (e.g. danger rows), or pass a render-prop child
 *  for fully custom (multi-line) rows. `window` is the memoized slice from useListNav,
 *  so the heavy work happens once per render. */
export function ModalList<T>(props: {
  window: { slice: T[]; offset: number; selected: number }
  selectable?: (item: T) => boolean
  label?: (item: T) => string
  right?: (item: T) => string
  /** Override the left marker; receives the row and whether it's selected. */
  marker?: (item: T, selected: boolean) => string
  /** Override the label color; receives the row and whether it's selected. */
  fg?: (item: T, selected: boolean) => string
  children?: (item: T, selected: boolean) => JSX.Element
}) {
  const { theme } = useTheme()
  return (
    <box flexDirection="column">
      <For each={props.window.slice}>
        {(item, i) => {
          const actionable = () => props.selectable?.(item) ?? true
          const sel = () => i() === props.window.selected && actionable()
          const marker = () => props.marker?.(item, sel()) ?? (actionable() ? (sel() ? "› " : "  ") : "  ")
          const fg = () => props.fg?.(item, sel()) ?? (sel() ? theme.accent : theme.text)
          return (
            <Show when={!props.children} fallback={props.children?.(item, sel())}>
              <box
                flexDirection="row"
                justifyContent="space-between"
                gap={2}
                backgroundColor={sel() ? theme.backgroundElement : undefined}
              >
                <text fg={fg()}>
                  {marker()}
                  {props.label?.(item) ?? ""}
                </text>
                <text fg={theme.textMuted}>{props.right?.(item) ?? ""}</text>
              </box>
            </Show>
          )
        }}
      </For>
    </box>
  )
}
