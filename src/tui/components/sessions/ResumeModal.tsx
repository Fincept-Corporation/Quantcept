import type { SessionRow, TranscriptRecord } from "@core/storage"
import { useRenderer } from "@opentui/solid"
import { formatRelativeTime } from "@shared/time"
import { useStorage } from "@tui/context/storage"
import { useTheme } from "@tui/context/theme"
import { ModalFrame, ModalList, useListNav, useModalKeyboard, useNotice } from "@tui/ui/modal"
import { createMemo, createSignal, Show } from "solid-js"
import { filterSessions } from "./filter"

/**
 * Browse and resume a past chat in this project. Built on the shared modal layer.
 * Type to filter by title; → previews the highlighted session; Enter resumes.
 */
export function ResumeModal(props: { onClose: () => void; onResume: (id: string) => void; currentSessionId?: string }) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const storage = useStorage()
  const notice = useNotice()
  const ph = storage.projectHashFor(process.cwd())

  const [query, setQuery] = createSignal("")
  const [view, setView] = createSignal<"list" | "preview">("list")

  const items = createMemo<SessionRow[]>(() =>
    filterSessions(storage.listSessions(ph), query(), props.currentSessionId),
  )
  const titleOf = (s: SessionRow) => s.title?.trim() || "(untitled)"
  const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

  const nav = useListNav<SessionRow>({
    items,
    onSelect: (s) => {
      props.onResume(s.id)
      props.onClose()
    },
    onKey: (e, sel) => {
      if (view() === "preview") {
        if (e.name === "escape" || e.name === "left") {
          setView("list")
          renderer.requestRender()
        }
        return true // preview swallows every key
      }
      // list view
      if (e.name === "right") {
        if (sel) {
          setView("preview")
          renderer.requestRender()
        }
        return true
      }
      if (e.name === "backspace") {
        setQuery((q) => q.slice(0, -1))
        nav.setCursor(0)
        renderer.requestRender()
        return true
      }
      // printable char → append to search (guard against control keys whose
      // sequence is also length 1, e.g. Enter "\r", so Enter still resumes)
      const printable =
        typeof e.sequence === "string" &&
        e.sequence.length === 1 &&
        !e.ctrl &&
        !e.meta &&
        e.name !== "return" &&
        e.name !== "kpenter" &&
        e.name !== "escape" &&
        e.name !== "backspace" &&
        e.name !== "tab"
      if (printable) {
        setQuery((q) => q + e.sequence)
        nav.setCursor(0)
        renderer.requestRender()
        return true
      }
      return false
    },
    onEscape: () => {
      if (query()) {
        setQuery("")
        nav.setCursor(0)
        renderer.requestRender()
      } else props.onClose()
    },
  })
  useModalKeyboard({ nav })

  // Read the transcript only while previewing (not on every scroll).
  const preview = createMemo(() => {
    if (view() !== "preview") return { first: "", last: "" }
    const sel = items()[nav.cursor()]
    if (!sel) return { first: "", last: "" }
    const msgs = storage.loadSession(sel.id).filter((r): r is Extract<TranscriptRecord, { t: "msg" }> => r.t === "msg")
    return {
      first: msgs.find((m) => m.role === "user")?.content ?? "",
      last: [...msgs].reverse().find((m) => m.role === "assistant")?.content ?? "",
    }
  })

  return (
    <ModalFrame
      title="↻ Resume a session"
      footer={view() === "list" ? "↑/↓ move · → preview · Enter resume · type to search · Esc close" : "←/Esc back"}
      notice={notice.notice()}
    >
      <Show
        when={view() === "list"}
        fallback={
          <box flexDirection="column">
            <text fg={theme.accent}>{titleOf(items()[nav.cursor()] ?? ({ title: "" } as SessionRow))}</text>
            <box height={1} minHeight={0} />
            <text fg={theme.textMuted}>You:</text>
            <text fg={theme.text}>{trunc(preview().first, 240) || "(no messages)"}</text>
            <box height={1} minHeight={0} />
            <text fg={theme.textMuted}>Assistant:</text>
            <text fg={theme.text}>{trunc(preview().last, 240) || "(no reply yet)"}</text>
          </box>
        }
      >
        <Show
          when={items().length > 0}
          fallback={
            <text fg={theme.textMuted}>
              {query() ? `No sessions match "${query()}".` : "No previous sessions in this project."}
            </text>
          }
        >
          <box flexDirection="column">
            <Show when={query()}>
              <text fg={theme.textMuted}>search: {query()}</text>
            </Show>
            <ModalList
              window={nav.window()}
              label={(s) => trunc(titleOf(s), 48)}
              right={(s) => `${formatRelativeTime(s.updatedAt)} · ${s.msgCount} msgs`}
            />
          </box>
        </Show>
      </Show>
    </ModalFrame>
  )
}
