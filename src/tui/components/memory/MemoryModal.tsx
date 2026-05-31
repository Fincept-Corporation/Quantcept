import { forget, listMemories, type MemoryEntry } from "@core/memory"
import { projectHash } from "@core/storage/paths"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { createSignal, For, Show } from "solid-js"

type ScopedEntry = MemoryEntry & { scope: "global" | "project" }

/**
 * Browse the memories saved via /remember (the agent's `recall` reads the same store).
 * Project + global scopes, view the full body, and delete. Self-contained: reads core/memory.
 */
export function MemoryModal(props: { onClose: () => void }) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const ph = projectHash()

  const [view, setView] = createSignal<"list" | "detail">("list")
  const [cursor, setCursor] = createSignal(0)
  const [tick, setTick] = createSignal(0)
  const [notice, setNotice] = createSignal<string | undefined>()
  const rerender = () => renderer.requestRender()

  function entries(): ScopedEntry[] {
    tick()
    return [
      ...listMemories("project", ph).map((m) => ({ ...m, scope: "project" as const })),
      ...listMemories("global").map((m) => ({ ...m, scope: "global" as const })),
    ]
  }

  // biome-ignore lint/suspicious/noExplicitAny: @opentui keyboard event is untyped (matches SettingsModal)
  useKeyboard((e: any) => {
    const list = entries()
    if (view() === "detail") {
      if (e.name === "escape" || e.name === "left") {
        e.preventDefault?.()
        setView("list")
        rerender()
      }
      return
    }
    if (e.name === "escape") {
      e.preventDefault?.()
      props.onClose()
      return
    }
    if (e.name === "up") {
      e.preventDefault?.()
      setCursor((c) => Math.max(0, c - 1))
      rerender()
      return
    }
    if (e.name === "down") {
      e.preventDefault?.()
      setCursor((c) => Math.min(Math.max(0, list.length - 1), c + 1))
      rerender()
      return
    }
    const sel = list[cursor()]
    if (!sel) return
    if (e.name === "return" || e.name === "kpenter") {
      e.preventDefault?.()
      setView("detail")
      rerender()
      return
    }
    if (e.name === "d" || e.sequence === "d") {
      e.preventDefault?.()
      forget(sel.scope, sel.scope === "project" ? ph : undefined, sel.slug)
      setCursor((c) => Math.max(0, c - 1))
      setTick((n) => n + 1)
      setNotice(`Deleted "${sel.title}".`)
      rerender()
    }
  })

  const WINDOW = 14
  function windowed<T>(items: T[]): { slice: T[]; offset: number } {
    if (items.length <= WINDOW) return { slice: items, offset: 0 }
    const off = Math.min(Math.max(0, cursor() - Math.floor(WINDOW / 2)), items.length - WINDOW)
    return { slice: items.slice(off, off + WINDOW), offset: off }
  }

  return (
    <box flexDirection="column" minWidth={62} gap={0}>
      <text fg={theme.accent}>🧠 Memories</text>
      <box height={1} minHeight={0} />

      <Show
        when={view() === "list"}
        fallback={
          <box flexDirection="column">
            <text fg={theme.accent}>{entries()[cursor()]?.title ?? ""}</text>
            <box height={1} minHeight={0} />
            <For each={(entries()[cursor()]?.body ?? "").split("\n")}>
              {(line) => <text fg={theme.text}>{line}</text>}
            </For>
          </box>
        }
      >
        <Show
          when={entries().length > 0}
          fallback={<text fg={theme.textMuted}>No memories yet. Use /remember &lt;fact&gt; to save one.</text>}
        >
          <box flexDirection="column">
            <For each={windowed(entries()).slice}>
              {(m, i) => {
                const idx = () => windowed(entries()).offset + i()
                const sel = () => idx() === cursor()
                return (
                  <box
                    flexDirection="row"
                    justifyContent="space-between"
                    gap={2}
                    backgroundColor={sel() ? theme.backgroundElement : undefined}
                  >
                    <text fg={sel() ? theme.accent : theme.text}>{(sel() ? "› " : "  ") + m.title}</text>
                    <text fg={theme.textMuted}>{m.scope}</text>
                  </box>
                )
              }}
            </For>
          </box>
        </Show>
      </Show>

      <box height={1} minHeight={0} />
      <Show when={notice()}>
        <text fg={theme.accent}>{notice()}</text>
      </Show>
      <text fg={theme.textMuted}>
        {view() === "list" ? "↑/↓ move · Enter view · d delete · Esc close" : "Esc back"}
      </text>
    </box>
  )
}
