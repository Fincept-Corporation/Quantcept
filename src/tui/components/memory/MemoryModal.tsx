import { forget, listMemories, type MemoryEntry } from "@core/memory"
import { projectHash } from "@core/storage/paths"
import { useRenderer } from "@opentui/solid"
import { useTheme } from "@tui/context/theme"
import { ModalFrame, ModalList, useListNav, useModalKeyboard, useNotice } from "@tui/ui/modal"
import { createSignal, For, Show } from "solid-js"

type ScopedEntry = MemoryEntry & { scope: "global" | "project" }

/**
 * Browse the memories saved via /remember (the agent's `recall` reads the same store).
 * Project + global scopes, view the full body, and delete. Built on the shared modal layer.
 */
export function MemoryModal(props: { onClose: () => void }) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const ph = projectHash()
  const [view, setView] = createSignal<"list" | "detail">("list")
  const [tick, setTick] = createSignal(0)
  const notice = useNotice()

  const entries = (): ScopedEntry[] => {
    tick() // dependency: re-read after a delete
    return [
      ...listMemories("project", ph).map((m) => ({ ...m, scope: "project" as const })),
      ...listMemories("global").map((m) => ({ ...m, scope: "global" as const })),
    ]
  }

  const nav = useListNav<ScopedEntry>({
    items: entries,
    onSelect: () => {
      setView("detail")
      renderer.requestRender()
    },
    onKey: (e, sel) => {
      if (view() === "detail") {
        if (e.name === "escape" || e.name === "left") {
          setView("list")
          renderer.requestRender()
        }
        return true // detail mode swallows all keys
      }
      if ((e.name === "d" || e.sequence === "d") && sel) {
        forget(sel.scope, sel.scope === "project" ? ph : undefined, sel.slug)
        nav.setCursor(Math.max(0, nav.cursor() - 1))
        setTick((n) => n + 1)
        notice.flash(`Deleted "${sel.title}".`)
        return true
      }
      return false
    },
    onEscape: props.onClose,
  })
  useModalKeyboard({ nav })

  return (
    <ModalFrame
      title="🧠 Memories"
      footer={view() === "list" ? "↑/↓ move · Enter view · d delete · Esc close" : "Esc back"}
      notice={notice.notice()}
    >
      <Show
        when={view() === "list"}
        fallback={
          <box flexDirection="column">
            <text fg={theme.accent}>{entries()[nav.cursor()]?.title ?? ""}</text>
            <box height={1} minHeight={0} />
            <For each={(entries()[nav.cursor()]?.body ?? "").split("\n")}>
              {(line) => <text fg={theme.text}>{line}</text>}
            </For>
          </box>
        }
      >
        <Show
          when={entries().length > 0}
          fallback={<text fg={theme.textMuted}>No memories yet. Use /remember &lt;fact&gt; to save one.</text>}
        >
          <ModalList window={nav.window()} label={(m) => m.title} right={(m) => m.scope} />
        </Show>
      </Show>
    </ModalFrame>
  )
}
