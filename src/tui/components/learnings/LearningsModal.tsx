import type { LearningItem } from "@core/fincept"
import { useRenderer } from "@opentui/solid"
import { FinceptAuthError, InsufficientCreditsError } from "@shared/errors"
import type { AuthContext } from "@tui/context/auth"
import { useTheme } from "@tui/context/theme"
import {
  ModalFormView,
  ModalFrame,
  ModalList,
  useListNav,
  useModalForm,
  useModalKeyboard,
  useNotice,
} from "@tui/ui/modal"
import { createSignal, For, onCleanup, Show } from "solid-js"

type View = "feed" | "search" | "detail"
type Row =
  | { kind: "action"; label: string; act: () => void }
  | { kind: "item"; item: LearningItem }
  | { kind: "info"; label: string }

function errMsg(e: unknown): string {
  if (e instanceof InsufficientCreditsError) return `Insufficient credits (need ${e.required}, have ${e.available}).`
  if (e instanceof FinceptAuthError) return "Not signed in to Fincept."
  return e instanceof Error ? e.message : String(e)
}

/**
 * The community "learnings" registry: search (pgvector), browse the feed, view
 * a learning's metadata, get a download URL, and publish. Built on the shared modal layer.
 */
export function LearningsModal(props: { auth: AuthContext; onClose: () => void }) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const lib = props.auth.learnings
  const notice = useNotice({ mapError: errMsg })
  const form = useModalForm({ onError: notice.fail })

  const [view, setView] = createSignal<View>("feed")
  const [rows, setRows] = createSignal<Row[]>([])
  const [loading, setLoading] = createSignal(false)
  const [current, setCurrent] = createSignal<LearningItem | undefined>()
  // Two-press guard for the destructive delete action (no separate confirm dialog in this modal).
  const [pendingDelete, setPendingDelete] = createSignal(false)

  const run = (p: Promise<unknown> | unknown): Promise<void> =>
    Promise.resolve(p)
      .then(() => undefined)
      .catch((e) => notice.fail(e))

  const startSearch = () =>
    form.start({ title: "Search learnings", fields: ["Query"], onComplete: ([q]) => doSearch((q ?? "").trim()) })
  const startPublish = () =>
    form.start({
      title: "Publish learning (pending approval)",
      fields: ["Title", "Content"],
      onComplete: ([title, content]) =>
        run(
          lib.upload({ title: title ?? "", content: content ?? "" }).then((r) => {
            const hash = r.data?.torrent_hash
            notice.flash(
              hash
                ? `Published — pending approval. Torrent ${hash.slice(0, 16)}… (seeds on approval).`
                : "Published — pending admin approval.",
            )
          }),
        ),
    })
  const searchAction = (): Row => ({ kind: "action", label: "🔍 Search…", act: startSearch })
  const publishAction = (): Row => ({ kind: "action", label: "＋ Publish a learning", act: startPublish })

  // Owner actions on a learning (PUT /:id · DELETE /:id · POST /:id/flag). The backend
  // authorizes — edit/delete only succeed on your own uploads; flag works on any item.
  function startEdit(it: LearningItem) {
    form.start(
      {
        title: "Edit title",
        fields: ["Title"],
        onComplete: ([title]) =>
          run(
            lib
              // Preserve the existing description (the form prefills one field only).
              .update(it.id, { title: (title ?? "").trim() || it.title, description: it.description })
              .then(() => {
                notice.flash("Updated.")
                void refreshDetail(it.id)
              }),
          ),
      },
      it.title,
    )
  }
  function startFlag(it: LearningItem) {
    form.start({
      title: "Report learning",
      fields: ["Reason"],
      onComplete: ([reason]) =>
        run(lib.flag(it.id, (reason ?? "").trim() || "inappropriate").then(() => notice.flash("Reported — thanks."))),
    })
  }
  function confirmDelete(it: LearningItem) {
    if (!pendingDelete()) {
      setPendingDelete(true)
      notice.flash("Press x again to delete this learning.")
      return
    }
    setPendingDelete(false)
    void run(
      lib.remove(it.id).then(() => {
        notice.flash("Deleted.")
        detailBack()
        void loadFeed()
      }),
    )
  }

  async function loadFeed() {
    setView("feed")
    nav.setCursor(0)
    setLoading(true)
    notice.clear()
    try {
      const r = await lib.list()
      setRows([
        searchAction(),
        publishAction(),
        ...(r.data?.items ?? []).map((item) => ({ kind: "item", item }) as Row),
      ])
    } catch (e) {
      setRows([searchAction(), publishAction()])
      notice.fail(e)
    } finally {
      setLoading(false)
      renderer.requestRender()
    }
  }

  async function doSearch(q: string) {
    if (!q) return
    setView("search")
    nav.setCursor(0)
    setLoading(true)
    notice.clear()
    try {
      const r = await lib.search(q)
      const results = (r.data?.results ?? []).map((item) => ({ kind: "item", item }) as Row)
      setRows([
        searchAction(),
        ...(results.length ? results : [{ kind: "info", label: `No matches for "${q}".` } as Row]),
      ])
    } catch (e) {
      setRows([searchAction()])
      notice.fail(e)
    } finally {
      setLoading(false)
      renderer.requestRender()
    }
  }

  let detailTimer: ReturnType<typeof setInterval> | undefined
  onCleanup(() => clearInterval(detailTimer))

  // Feed items don't carry torrent hash / swarm counts — pull the full detail and
  // keep it refreshing (~3s) while open so seeders/leechers stay live.
  async function refreshDetail(id: string) {
    try {
      const r = await lib.get(id)
      if (view() === "detail" && current()?.id === id) {
        setCurrent(r.data)
        renderer.requestRender()
      }
    } catch {
      /* keep the feed item we already have */
    }
  }

  function openDetail(item: LearningItem) {
    setCurrent(item)
    setView("detail")
    setPendingDelete(false)
    notice.clear()
    void refreshDetail(item.id)
    clearInterval(detailTimer)
    detailTimer = setInterval(() => {
      const c = current()
      if (view() === "detail" && c) void refreshDetail(c.id)
      else clearInterval(detailTimer)
    }, 3000)
  }
  function detailBack() {
    setView("feed")
    setPendingDelete(false)
    nav.setCursor(0)
    renderer.requestRender()
  }

  const nav = useListNav<Row>({
    items: rows,
    onSelect: (row) => {
      if (row.kind === "action") row.act()
      else if (row.kind === "item") openDetail(row.item)
    },
    onKey: (e, row) => {
      if (view() === "detail") {
        if (e.name === "escape" || e.name === "left") {
          detailBack()
          return true
        }
        if (e.name === "g" || e.sequence === "g") {
          const it = current()
          if (it)
            void run(lib.download(it.id).then((r) => notice.flash(`Download URL (10 min): ${r.data.download_url}`)))
          return true
        }
        if (e.name === "d" || e.sequence === "d") {
          const it = current()
          if (it) p2pDownload(it)
          return true
        }
        if (e.name === "e" || e.sequence === "e") {
          const it = current()
          if (it) startEdit(it)
          return true
        }
        if (e.name === "f" || e.sequence === "f") {
          const it = current()
          if (it) startFlag(it)
          return true
        }
        if (e.name === "x" || e.sequence === "x") {
          const it = current()
          if (it) confirmDelete(it)
          return true
        }
        return true // detail swallows other keys
      }
      void row // unused in list mode
      return false
    },
    onEscape: () => {
      if (view() === "search") void loadFeed()
      else props.onClose()
    },
  })
  useModalKeyboard({ form, nav })

  void loadFeed() // load the feed once on open (after `nav` is initialized)

  function label(r: Row): string {
    if (r.kind === "action" || r.kind === "info") return r.label
    return r.item.title
  }
  function right(r: Row): string {
    if (r.kind !== "item") return ""
    const bits: string[] = []
    if (r.item.author) bits.push(r.item.author)
    if (typeof r.item.downloads === "number") bits.push(`${r.item.downloads}↓`)
    return bits.join(" · ")
  }
  function detailLines(it: LearningItem): string[] {
    const lines: string[] = []
    if (it.description) lines.push(it.description, "")
    if (it.author) lines.push(`Author: ${it.author}`)
    if (it.status) lines.push(`Status: ${it.status}`)
    if (typeof it.version === "number") lines.push(`Version: ${it.version}`)
    if (typeof it.downloads === "number") lines.push(`Downloads: ${it.downloads}`)
    if (typeof it.file_size === "number") lines.push(`Size: ${it.file_size} bytes`)
    if (it.tags?.length) lines.push(`Tags: ${it.tags.join(", ")}`)
    if (it.torrent_hash) lines.push(`Torrent: ${it.torrent_hash.slice(0, 16)}…`)
    if (typeof it.seeders === "number") lines.push(`Swarm: ${it.seeders} seeding · ${it.leechers ?? 0} downloading`)
    return lines
  }

  // P2P download via the Go sidecar, streaming live progress into the notice.
  function p2pDownload(it: LearningItem) {
    notice.flash("Starting P2P download…")
    void props.auth.learningsSidecar
      .download(it.id, (ev) => {
        if (ev.event === "progress") {
          notice.flash(`↓ ${Math.round(ev.pct ?? 0)}% · ${ev.peers ?? 0} peers`)
        } else if (ev.event === "done") {
          notice.flash(`Downloaded via ${ev.via} → ${ev.path}`)
        } else if (ev.event === "error") {
          notice.fail(new Error(ev.message ?? "download failed"))
        }
        renderer.requestRender()
      })
      .catch((e) => notice.fail(e))
  }

  return (
    <ModalFrame
      title={view() === "detail" ? `📚  ${current()?.title ?? ""}` : "📚  Learnings registry"}
      footer={
        view() === "detail"
          ? "d P2P · g URL · e edit · f report · x delete · Esc back"
          : "↑/↓ · Enter open · Esc back/close"
      }
      notice={notice.notice()}
      error={notice.err()}
    >
      <Show
        when={form.active()}
        fallback={
          <Show
            when={view() === "detail"}
            fallback={
              <Show when={!loading()} fallback={<text fg={theme.textMuted}>Loading…</text>}>
                <ModalList window={nav.window()} selectable={(r) => r.kind !== "info"} label={label} right={right} />
              </Show>
            }
          >
            <box flexDirection="column">
              <For each={detailLines(current() ?? ({} as LearningItem))}>
                {(line) => <text fg={theme.text}>{line}</text>}
              </For>
            </box>
          </Show>
        }
      >
        <ModalFormView form={form} fields={form.spec()?.fields ?? []} title={form.spec()?.title} />
      </Show>
    </ModalFrame>
  )
}
